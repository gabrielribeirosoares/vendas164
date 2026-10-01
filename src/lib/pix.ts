import QRCode from 'qrcode';

export interface PixPayloadOptions {
  key: string;
  name?: string;
  city?: string;
  amount?: number;
  txid?: string;
}

/**
 * Calculates the CRC16-CCITT checksum required by the Central Bank EMV BR Code standard.
 * Polynomial: 0x1021, Initial: 0xFFFF.
 */
function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Formats a Tag-Length-Value (TLV) block according to EMV specifications.
 */
function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Normalizes text to ASCII without accents or special characters.
 */
function normalizeAscii(text: string, maxLen: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Cleans the PIX key format based on key type.
 */
export function sanitizePixKey(key: string): string {
  const trimmed = key.trim();
  // Check if it's an email
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  // Check if it's an EVP / UUID (random key)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  // If it only has digits or phone formatting
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11) {
    // Could be CPF or Brazilian Phone (DDD + 9 digits)
    // If original starts with +55 or has phone format with parentheses, or user put phone
    return trimmed.startsWith('+') ? `+${digits}` : digits;
  }
  if (digits.length === 14) {
    // CNPJ
    return digits;
  }
  return trimmed;
}

/**
 * Generates the official Brazilian Central Bank (BACEN) BR Code "Copia e Cola" string.
 */
export function generatePixCopiaECola({
  key,
  name = 'VENDAS 164',
  city = 'SAO PAULO',
  amount,
  txid = '***',
}: PixPayloadOptions): string {
  if (!key) return '';

  const cleanKey = sanitizePixKey(key);
  const cleanName = normalizeAscii(name, 25) || 'LOJA';
  const cleanCity = normalizeAscii(city, 15) || 'BRASIL';
  const cleanTxid = normalizeAscii(txid, 25) || '***';

  const amountStr = amount && amount > 0 ? Number(amount).toFixed(2) : undefined;

  // Tag 26: Merchant Account Information
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', cleanKey);

  // Assemble full TLV payload before CRC
  let payload =
    tlv('00', '01') + // Format indicator
    tlv('26', merchantAccount) + // Merchant account info
    tlv('52', '0000') + // Merchant category code
    tlv('53', '986') + // Currency: BRL (986)
    (amountStr ? tlv('54', amountStr) : '') + // Transaction amount
    tlv('58', 'BR') + // Country code
    tlv('59', cleanName) + // Merchant name
    tlv('60', cleanCity) + // Merchant city
    tlv('62', tlv('05', cleanTxid)) + // Additional data (Reference label)
    '6304'; // CRC placeholder (Tag 63, length 04)

  const checksum = crc16(payload);
  return `${payload}${checksum}`;
}

/**
 * Generates a base64 Data URL for the QR Code image of the PIX payload.
 */
export async function generatePixQrCode(
  payload: string,
  options?: { width?: number; margin?: number },
): Promise<string> {
  if (!payload) return '';
  return QRCode.toDataURL(payload, {
    width: options?.width || 256,
    margin: options?.margin ?? 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}
