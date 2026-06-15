// Shared types between the chattr. frontend and the Chattr.Api backend.
// Keep these in sync with Chattr.Core.DTOs.* on the server.

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string; // ISO 8601
}

export interface AuthResponse {
  token: string;
  expiresAt: string; // ISO 8601
  user: PublicUser;
}

export interface UserLoginPayload {
  username: string;
  password: string;
}

export interface UserRegisterPayload {
  username: string;
  password: string;
  confirmPassword: string;
  securityQuestion: string;
  securityAnswer: string;
}

export interface UsernameAvailability {
  username: string;
  available: boolean;
}

/** Thrown by the api client when the backend returns a non-2xx response. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}
