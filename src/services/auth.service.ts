import axios from "axios";
import {
  AuthResponse,
  EmailOTPRequest,
  EmailOTPAuthenticate,
  UserProfile,
} from "../utils/types";
import { AppDataSource } from "../config/database";
import { User } from "../entities/user.entity";

class AuthService {
  private static instance: AuthService;
  private userRepository = AppDataSource.getRepository(User);

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async getHeaders(chatId: number) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await this.getAccessToken(chatId)}`,
    };
  }

  public async requestEmailOTP(email: string): Promise<{ sid: string }> {
    const payload: EmailOTPRequest = { email };
    const response = await axios.post<{ sid: string }>(
      `${process.env.COPPERX_API_BASE_URL}/api/auth/email-otp/request`,
      payload
    );
    return response.data;
  }

  public async authenticateEmailOTP(
    chatId: number,
    email: string,
    otp: string,
    sid: string
  ): Promise<AuthResponse> {
    const payload: EmailOTPAuthenticate = { email, otp, sid };
    const response = await axios.post<AuthResponse>(
      `${process.env.COPPERX_API_BASE_URL}/api/auth/email-otp/authenticate`,
      payload
    );

    const user = User.fromProfile(
      chatId,
      response.data.user,
      response.data.accessToken,
      response.data.accessTokenId,
      new Date(response.data.expireAt)
    );

    await this.userRepository.save(user);
    return response.data;
  }

  public async getProfile(chatId: number): Promise<UserProfile> {
    const user = await this.userRepository.findOne({ where: { chatId } });
    if (!user) {
      throw new Error("User not found");
    }

    const response = await axios.get<UserProfile>(
      `${process.env.COPPERX_API_BASE_URL}/api/auth/me`,
      { headers: await this.getHeaders(chatId) }
    );

    user.email = response.data.email;
    user.name = response.data.firstName + " " + response.data.lastName;
    await this.userRepository.save(user);

    return response.data;
  }

  public async isAuthenticated(chatId: number): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { chatId } });
    if (!user) return false;

    if (new Date() > user.expireAt) {
      await this.logout(chatId);
      return false;
    }

    return true;
  }

  public async logout(chatId: number): Promise<void> {
    await this.userRepository.delete({ chatId });
  }

  private async getAccessToken(chatId: number): Promise<string> {
    const user = await this.userRepository.findOne({ where: { chatId } });
    if (!user) {
      throw new Error("User not found");
    }

    return user.getDecryptedAccessToken();
  }
}

export const authService = AuthService.getInstance();
