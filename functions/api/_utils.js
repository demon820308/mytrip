// _utils.js
// Shared utilities for authentication and database access

// Convert string to ArrayBuffer
function str2ab(str) {
  return new TextEncoder().encode(str);
}

// Convert ArrayBuffer to hex string
function buf2hex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

// Hash password with salt using PBKDF2
export async function hashPassword(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    str2ab(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: str2ab(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  
  const exported = await crypto.subtle.exportKey("raw", key);
  return buf2hex(exported);
}

// Generate a random salt
export function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return buf2hex(array);
}

// Base64Url encode
function base64UrlEncode(arrayBuffer) {
  let base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Base64Url decode
function base64UrlDecode(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Sign JWT
export async function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(str2ab(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(str2ab(JSON.stringify(payload)));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  
  const key = await crypto.subtle.importKey(
    "raw",
    str2ab(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, str2ab(dataToSign));
  const encodedSignature = base64UrlEncode(signature);
  
  return `${dataToSign}.${encodedSignature}`;
}

// Verify JWT
export async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    
    const key = await crypto.subtle.importKey(
      "raw",
      str2ab(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(encodedSignature),
      str2ab(dataToSign)
    );
    
    if (isValid) {
      const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // expired
      }
      return payload;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Helper to extract and verify auth token from Request
export async function getAuthUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.split(' ')[1];
  const secret = env.JWT_SECRET || 'fallback_secret_for_dev_only';
  
  return await verifyJWT(token, secret);
}

// Helper to extract JSON from request payload safely
export async function readRequestBody(request) {
  const contentType = request.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await request.json();
  }
  return {};
}

// Helper for generic CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password',
};
