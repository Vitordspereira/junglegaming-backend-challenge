export interface MoneyRequestDto {
  amount: string;
  currency: string;
}

export interface CreateWalletRequestDto {
  playerId: string;
  initialBalance: MoneyRequestDto;
}

export interface MoneyResponseDto {
  amount: string;
  currency: string;
}

export interface CreateWalletResponseDto {
  id: string;
  playerId: string;
  balance: MoneyResponseDto;
  version: number;
}
