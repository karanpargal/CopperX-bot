import axios from "axios";
import { authService } from "../services/auth.service";

export const getWalletBalances = async (chatId: number) => {
  try {
    const response = await axios.get(
      `${process.env.COPPERX_API_BASE_URL}/api/wallets/balances`,
      {
        headers: await authService.getHeaders(chatId),
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching wallet balances:", error);
    throw error;
  }
};

export const getDefaultWallet = async (chatId: number) => {
  try {
    const response = await axios.get(
      `${process.env.COPPERX_API_BASE_URL}/api/wallets/default`,
      {
        headers: await authService.getHeaders(chatId),
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching default wallet:", error);
    throw error;
  }
};

export const getPayees = async (chatId: number) => {
  try {
    const response = await axios.get(
      `${process.env.COPPERX_API_BASE_URL}/api/payees?page=1&limit=10`,
      { headers: await authService.getHeaders(chatId) }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching payees:", error);
    throw error;
  }
};

export const getAccounts = async (chatId: number) => {
  try {
    const response = await axios.get(
      `${process.env.COPPERX_API_BASE_URL}/api/accounts`,
      { headers: await authService.getHeaders(chatId) }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching accounts:", error);
    throw error;
  }
};

export const getTransfers = async (chatId: number) => {
  try {
    const response = await axios.get(
      `${process.env.COPPERX_API_BASE_URL}/api/transfers?page=1&limit=10`,
      { headers: await authService.getHeaders(chatId) }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching transfers:", error);
    throw error;
  }
};

export const savePayee = async (
  chatId: number,
  payload: {
    email: string;
    nickName?: string;
  }
) => {
  try {
    const response = await axios.post(
      `${process.env.COPPERX_API_BASE_URL}/api/payees`,
      payload,
      { headers: await authService.getHeaders(chatId) }
    );
    return response.data;
  } catch (error) {
    console.error("Error saving payee:", error);
    throw error;
  }
};

export const getUser = async (chatId: number) => {
  try {
    const response = await axios.get(
      `${process.env.COPPERX_API_BASE_URL}/api/auth/me`,
      {
        headers: await authService.getHeaders(chatId),
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching user:", error);
    throw error;
  }
};

export const getKYCStatus = async (chatId: number) => {
  try {
    const response = await axios.get(
      `${process.env.COPPERX_API_BASE_URL}/api/kycs`,
      {
        headers: await authService.getHeaders(chatId),
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching KYC status:", error);
    throw error;
  }
};

export const getWallets = async (chatId: number) => {
  try {
    const response = await axios.get(
      `${process.env.COPPERX_API_BASE_URL}/api/wallets`,
      { headers: await authService.getHeaders(chatId) }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching wallets:", error);
    throw error;
  }
};

export const setDefaultWallet = async (chatId: number, walletId: string) => {
  try {
    const response = await axios.post(
      `${process.env.COPPERX_API_BASE_URL}/api/wallets/default`,
      { walletId },
      { headers: await authService.getHeaders(chatId) }
    );
    return response.data;
  } catch (error) {
    console.error("Error setting default wallet:", error);
    throw error;
  }
};
