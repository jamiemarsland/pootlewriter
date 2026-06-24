import { WordPressConfig } from '../types';

const ENCRYPTION_KEY = 'pootlewriter_key';

async function getKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data: WordPressConfig): Promise<string> {
  try {
    const key = await getKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = encoder.encode(JSON.stringify(data));
    
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );
    
    const encryptedArray = new Uint8Array(encryptedData);
    const combinedArray = new Uint8Array(iv.length + encryptedArray.length);
    combinedArray.set(iv);
    combinedArray.set(encryptedArray, iv.length);
    
    return btoa(String.fromCharCode.apply(null, Array.from(combinedArray)));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt WordPress configuration');
  }
}

export async function decryptData(encryptedData: string): Promise<WordPressConfig> {
  try {
    const key = await getKey();
    const decoder = new TextDecoder();
    
    // Convert base64 to byte array
    const combinedArray = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    if (combinedArray.length < 12) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = combinedArray.slice(0, 12);
    const data = combinedArray.slice(12);
    
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    const decryptedText = decoder.decode(decryptedData);
    const parsedData = JSON.parse(decryptedText);
    
    // Validate the decrypted data structure
    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('Invalid decrypted data format');
    }
    
    // Ensure all required fields are present
    const requiredFields = ['url', 'username', 'password', 'publishAsDraft'];
    for (const field of requiredFields) {
      if (!(field in parsedData)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    return parsedData as WordPressConfig;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt WordPress configuration');
  }
}