export type AppErrorCode =
  | 'GPS_ERROR'
  | 'OBD_ERROR'
  | 'BLUETOOTH_ERROR'
  | 'MAP_ERROR'
  | 'OFFLINE_MAP_ERROR'
  | 'STOREKIT_ERROR'
  | 'PERMISSION_ERROR'
  | 'DR_ERROR';

const userMessages: Record<AppErrorCode, string> = {
  GPS_ERROR: 'Геопозиція зараз недоступна.',
  OBD_ERROR: 'Не вдалося прочитати дані автомобіля.',
  BLUETOOTH_ERROR: 'Bluetooth недоступний.',
  MAP_ERROR: 'Карту не вдалося показати.',
  OFFLINE_MAP_ERROR: 'Область не завантажилась.',
  STOREKIT_ERROR: 'Покупку не завершено.',
  PERMISSION_ERROR: 'Потрібен дозвіл, щоб продовжити.',
  DR_ERROR: 'Оцінку положення зараз не зібрано.',
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly developerMessage: string;

  constructor(code: AppErrorCode, developerMessage: string, userMessage?: string) {
    super(developerMessage);
    this.name = 'AppError';
    this.code = code;
    this.developerMessage = developerMessage;
    this.userMessage = userMessage ?? userMessages[code];
  }
}

export function toAppError(error: unknown, fallback: AppErrorCode): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return new AppError(fallback, message);
}

export function logDeveloperError(error: AppError): void {
  console.warn(`[${error.code}] ${error.developerMessage}`);
}
