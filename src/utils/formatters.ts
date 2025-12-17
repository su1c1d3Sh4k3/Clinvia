/**
 * Utility functions for formatting data in the frontend
 * These do NOT affect database storage - display only
 */

/**
 * Format phone number with Brazilian mask: +55 (XX) X XXXX-XXXX
 * @param value - Raw phone number string
 * @returns Formatted phone string
 */
export function formatPhoneNumber(value: string): string {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');

    // Limit to 13 digits (55 + DDD + 9 digits)
    const limited = digits.slice(0, 13);

    // Apply mask progressively
    if (limited.length === 0) return '';
    if (limited.length <= 2) return `+${limited}`;
    if (limited.length <= 4) return `+${limited.slice(0, 2)} (${limited.slice(2)}`;
    if (limited.length <= 5) return `+${limited.slice(0, 2)} (${limited.slice(2, 4)}) ${limited.slice(4)}`;
    if (limited.length <= 9) return `+${limited.slice(0, 2)} (${limited.slice(2, 4)}) ${limited.slice(4, 5)} ${limited.slice(5)}`;
    return `+${limited.slice(0, 2)} (${limited.slice(2, 4)}) ${limited.slice(4, 5)} ${limited.slice(5, 9)}-${limited.slice(9)}`;
}

/**
 * Remove phone formatting, keeping only digits
 * @param value - Formatted phone string
 * @returns Raw digits only
 */
export function unformatPhoneNumber(value: string): string {
    return value.replace(/\D/g, '');
}

/**
 * Validate email format
 * @param email - Email string to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Format date to DD/MM/YYYY for display
 * @param date - Date object or ISO string
 * @returns Formatted date string
 */
export function formatDateBR(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Format datetime to DD/MM/YYYY HH:mm for display
 * @param date - Date object or ISO string
 * @returns Formatted datetime string
 */
export function formatDateTimeBR(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const dateStr = formatDateBR(d);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}`;
}

/**
 * Parse DD/MM/YYYY string to Date object
 * @param dateStr - Date string in DD/MM/YYYY format
 * @returns Date object
 */
export function parseDateBR(dateStr: string): Date {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
}
