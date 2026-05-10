// Web Push 实现（RFC 8291 aes128gcm + VAPID）
// 兼容 Cloudflare Workers / Pages Functions —— 用 Web Crypto API，不依赖 Node 模块
//
// 用法：
//   await sendPush(subscription, payload, vapid)
// 其中：
//   subscription = { endpoint, keys: { p256dh, auth } }（浏览器订阅返回的格式）
//   payload      = { title, body, ... }（任意 JSON）
//   vapid        = { publicKey, privateKey, subject }（base64url 字符串 + mailto: subject）

// ====== base64url 工具 ======
function b64uEncode(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(str) {
  const padding = "=".repeat((4 - str.length % 4) % 4);
  const b64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
function strToBytes(s) { return new TextEncoder().encode(s); }

function concatBytes(...arrs) {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// ====== HKDF（HMAC-SHA256）======
async function hkdf(salt, ikm, info, length) {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    length * 8
  );
  return new Uint8Array(bits);
}

// ====== ECDSA P-256 私钥（base64url 的 d）→ JWK 导入 ======
// publicKey 是 65 字节的未压缩 P-256 公钥（0x04 + 32B X + 32B Y）的 base64url
async function importVapidPrivateKey(privateKeyB64u, publicKeyB64u) {
  const dBytes = b64uDecode(privateKeyB64u);
  const pubBytes = b64uDecode(publicKeyB64u);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error("VAPID 公钥格式错误（应为 65 字节未压缩 P-256）");
  }
  const x = pubBytes.slice(1, 33);
  const y = pubBytes.slice(33, 65);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: b64uEncode(dBytes),
    x: b64uEncode(x),
    y: b64uEncode(y),
    ext: true
  };
  return await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

// ====== 签发 VAPID JWT ======
async function signVapidJwt(privateKey, audience, subject) {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject
  };
  const headerB64 = b64uEncode(strToBytes(JSON.stringify(header)));
  const payloadB64 = b64uEncode(strToBytes(JSON.stringify(payload)));
  const message = strToBytes(`${headerB64}.${payloadB64}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, message);
  return `${headerB64}.${payloadB64}.${b64uEncode(new Uint8Array(sig))}`;
}

// ====== aes128gcm 加密 payload（RFC 8291）======
// 输出二进制：salt(16) || record_size(4 BE) || pubkey_len(1=0x41) || server_pub(65) || ciphertext
async function encryptPayload(payloadBytes, clientP256dhB64u, clientAuthB64u) {
  const clientPubBytes = b64uDecode(clientP256dhB64u);   // 65 bytes
  const clientAuthBytes = b64uDecode(clientAuthB64u);     // 16 bytes

  // 1) 临时 ECDH P-256 密钥对
  const ephKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const serverPubBytes = new Uint8Array(await crypto.subtle.exportKey("raw", ephKeyPair.publicKey));
  // 65 bytes uncompressed

  // 2) 导入 client 公钥用于 ECDH
  const clientPubKey = await crypto.subtle.importKey(
    "raw", clientPubBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false, []
  );

  // 3) ECDH 共享密钥
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPubKey },
    ephKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // 4) salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 5) HKDF: 第一层
  // PRK_key = HKDF(salt=auth_secret, ikm=ECDH_shared, info="WebPush: info\0" || ua_pub || as_pub, L=32)
  const info1 = concatBytes(
    strToBytes("WebPush: info"),
    new Uint8Array([0]),
    clientPubBytes,
    serverPubBytes
  );
  const ikm = await hkdf(clientAuthBytes, sharedSecret, info1, 32);

  // 6) HKDF: 第二层 → CEK
  const cekInfo = concatBytes(strToBytes("Content-Encoding: aes128gcm"), new Uint8Array([0]));
  const cek = await hkdf(salt, ikm, cekInfo, 16);

  // 7) HKDF: 第二层 → nonce
  const nonceInfo = concatBytes(strToBytes("Content-Encoding: nonce"), new Uint8Array([0]));
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // 8) padding：append 0x02 then optional zeros（最简：仅一个 0x02）
  const padded = concatBytes(payloadBytes, new Uint8Array([0x02]));

  // 9) AES-128-GCM
  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    cekKey,
    padded
  );
  const ciphertext = new Uint8Array(ctBuf);

  // 10) 组装最终二进制
  // record_size: 4 字节 big-endian。规范允许 4096，避免分片
  const recordSize = new Uint8Array([0x00, 0x00, 0x10, 0x00]);
  const pubKeyLen = new Uint8Array([serverPubBytes.length]);  // 0x41 (65)
  return concatBytes(salt, recordSize, pubKeyLen, serverPubBytes, ciphertext);
}

// ====== 主入口 ======
export async function sendPush(subscription, payload, vapid) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("subscription 格式错误");
  }
  if (!vapid?.publicKey || !vapid?.privateKey || !vapid?.subject) {
    throw new Error("VAPID 配置不完整");
  }
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // VAPID JWT
  const privKey = await importVapidPrivateKey(vapid.privateKey, vapid.publicKey);
  const jwt = await signVapidJwt(privKey, audience, vapid.subject);

  // payload 加密
  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  const encryptedBody = await encryptPayload(strToBytes(payloadStr), subscription.keys.p256dh, subscription.keys.auth);

  // 发送
  const resp = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
      "Authorization": `vapid t=${jwt}, k=${vapid.publicKey}`,
      "Urgency": "normal"
    },
    body: encryptedBody
  });

  return {
    status: resp.status,
    ok: resp.ok,
    body: resp.ok ? null : await resp.text().catch(() => null)
  };
}
