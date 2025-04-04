import { Context } from "grammy";
import { authService } from "../services/auth.service";
import axios from "axios";
import { InlineKeyboard } from "grammy";
import {
  createBackToMenuKeyboard,
  createConfirmationKeyboard,
} from "../utils/keyboards";
import { BankQuote } from "../utils/types";
import {
  formatBalances,
  getTypeEmoji,
  isValidAmount,
  isValidEmail,
} from "../utils/helper";
import {
  getAccounts,
  getDefaultWallet,
  getPayees,
  getTransfers,
  getWalletBalances,
  savePayee,
} from "../utils/api";

export class TransferHandler {
  private static instance: TransferHandler;
  private userStates: Map<
    number,
    {
      action?: "email_transfer" | "wallet_transfer" | "bank_withdrawal";
      recipient?: string;
      amount?: string;
      symbol?: string;
      confirmationPending?: boolean;
      bankAccountId?: string;
      quote?: BankQuote;
      step?: string;
    }
  > = new Map();

  private constructor() {}

  public static getInstance(): TransferHandler {
    if (!TransferHandler.instance) {
      TransferHandler.instance = new TransferHandler();
    }
    return TransferHandler.instance;
  }

  public async handleEmailTransfer(ctx: Context): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    const isAuthenticated = await authService.isAuthenticated(chatId);
    if (!isAuthenticated) {
      await ctx.reply(
        "⚠️ You need to be logged in to send funds.\n\n" +
          "Please use /login to authenticate first.",
        {
          reply_markup: createBackToMenuKeyboard(),
        }
      );
      return;
    }

    try {
      const response = await getPayees(chatId);

      const payees = response;

      const keyboard = new InlineKeyboard();

      if (payees && payees.length > 0) {
        payees.forEach((payee: any) => {
          keyboard
            .text(
              `${payee.displayName || payee.nickName}`,
              `select_payee:${payee.email}`
            )
            .row();
        });
      }

      keyboard.text("➕ Add New Recipient", "add_new_recipient").row();
      keyboard.text("« Back to Menu", "main_menu");

      this.userStates.set(chatId, {
        action: "email_transfer",
        step: "recipient",
        confirmationPending: false,
      });

      let message = "📧 *Send to Email*\n\n";

      if (payees && payees.length > 0) {
        message += "Select a saved recipient or add a new one:";
      } else {
        message += "You don't have any saved recipients yet. Add a new one:";
      }

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Error fetching payees:", error);

      this.userStates.set(chatId, {
        action: "email_transfer",
        step: "recipient",
        confirmationPending: false,
      });

      await ctx.reply(
        "📧 *Send to Email*\n\n" +
          "Please enter the recipient's email address:",
        {
          parse_mode: "Markdown",
          reply_markup: createBackToMenuKeyboard(),
        }
      );
    }
  }

  public async handleWalletTransfer(ctx: Context): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    if (!(await authService.isAuthenticated(chatId))) {
      await ctx.reply(
        "🔒 This feature requires login!\n\n" +
          "Please use /login to connect your account first",
        {
          reply_markup: new InlineKeyboard().text("🔐 Login", "login"),
        }
      );
      return;
    }

    try {
      const balances = await getWalletBalances(chatId);
      const message = `
🔄 *External Wallet Transfer*

Available balances:
${formatBalances(balances)}

Please enter the recipient's wallet address:`;

      this.userStates.set(chatId, { action: "wallet_transfer" });

      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: "Markdown",
          reply_markup: createBackToMenuKeyboard(),
        });
      } else {
        await ctx.reply(message, {
          parse_mode: "Markdown",
          reply_markup: createBackToMenuKeyboard(),
        });
      }
    } catch (error) {
      console.error("Error fetching balances:", error);
      await ctx.reply(
        "❌ Couldn't fetch your balances.\n\n" +
          "Please try again or contact support if the issue persists",
        {
          reply_markup: new InlineKeyboard().text("🔄 Retry", "retry"),
        }
      );
    }
  }

  public async handleBankWithdrawal(ctx: Context): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    if (!(await authService.isAuthenticated(chatId))) {
      await ctx.reply(
        "🔒 This feature requires login!\n\n" +
          "Please use /login to connect your account first",
        {
          reply_markup: new InlineKeyboard().text("🔐 Login", "login"),
        }
      );
      return;
    }

    try {
      const [balancesResponse, defaultWalletResponse] = await Promise.all([
        getWalletBalances(chatId),
        getDefaultWallet(chatId),
      ]);

      const balances = balancesResponse;
      const defaultWallet = defaultWalletResponse;

      if (!balances || balances.length === 0) {
        await ctx.reply(
          "💰 No funds available for withdrawal.\n\n" +
            "Please deposit funds first using /deposit",
          {
            reply_markup: new InlineKeyboard().text("💰 Deposit", "deposit"),
          }
        );
        return;
      }

      const defaultWalletBalance = balances.find(
        (w: any) => w.walletId === defaultWallet.id
      );

      const accountsResponse = await getAccounts(chatId);

      const accounts = accountsResponse.data;
      const bankAccounts = accounts.filter(
        (account: any) => account.type === "bank_account"
      );

      if (!bankAccounts || bankAccounts.length === 0) {
        await ctx.reply(
          "🏦 No bank accounts found.\n\n" + "Please add a bank account first.",
          {
            reply_markup: new InlineKeyboard()
              .text("➕ Add Bank Account", "add_bank")
              .row()
              .text("« Back to Menu", "main_menu"),
          }
        );
        return;
      }

      const keyboard = new InlineKeyboard();
      bankAccounts.forEach((account: any, index: number) => {
        if (account.status === "verified") {
          keyboard
            .text(
              `${
                account.bankAccount.bankName
              } (${account.bankAccount.bankAccountNumber.slice(-4)})`,
              `select_bank:${account.id}`
            )
            .row();
        }
      });
      keyboard.text("« Back to Menu", "main_menu");

      const balanceMessage = defaultWalletBalance
        ? defaultWalletBalance.balances
            .map((b: any) => `• ${b.symbol}: ${Number(b.balance).toFixed(2)}`)
            .join("\n")
        : "No balance found in default wallet";

      await ctx.reply(
        `🏦 *Bank Withdrawal*\n\n` +
          `💰 *Available Balance:*\n${balanceMessage}\n\n` +
          `Select a bank account for withdrawal:`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      console.error("Error fetching data:", error);
      await ctx.reply(
        "❌ Something went wrong.\n\n" +
          "Please try again or contact support if the issue persists",
        {
          reply_markup: createBackToMenuKeyboard(),
        }
      );
    }
  }

  public async handleBankSelection(
    ctx: Context,
    bankAccountId: string
  ): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    this.userStates.set(chatId, {
      action: "bank_withdrawal",
      bankAccountId,
    });

    await ctx.reply(
      "💰 Please enter the amount you want to withdraw (e.g., '100'):",
      {
        reply_markup: createBackToMenuKeyboard(),
      }
    );
  }

  public async handleRecentTransfers(ctx: Context): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    if (!(await authService.isAuthenticated(chatId))) {
      await ctx.reply(
        "🔒 This feature requires login!\n\n" +
          "Please use /login to connect your account first",
        {
          reply_markup: new InlineKeyboard().text("🔐 Login", "login"),
        }
      );
      return;
    }

    try {
      const response = await getTransfers(chatId);

      const transfers = response.data;
      if (!transfers || transfers.length === 0) {
        await ctx.reply(
          "📊 No recent transfers found.\n\n" +
            "Your transfer history will appear here once you make some transactions.",
          {
            reply_markup: new InlineKeyboard().text(
              "📊 Transactions",
              "transfers"
            ),
          }
        );
        return;
      }

      const formatAmount = (amount: number, symbol: string = "USDC") => {
        return `${(amount / Math.pow(10, 8)).toFixed(2)} ${symbol}`;
      };

      const message = `
📊 *Recent Transfers*\n
${transfers
  .slice(0, 10)
  .map((tx: any) => {
    const type = tx.destinationAccount.bankName
      ? "Off-Ramp"
      : tx.type?.toUpperCase();
    const amount = formatAmount(tx.amount, tx.symbol);
    const recipient = tx.recipient || "N/A";
    const status = tx.status || "pending";
    const date = new Date(tx.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${getTypeEmoji(tx.type)} *${type}*
Amount: ${amount}
To: ${tx.destinationAccount.walletAddress ?? tx.destinationAccount.bankName}
Status: ${
      status === "success"
        ? "✅"
        : status === "pending" ||
          status === "initiated" ||
          status === "processing"
        ? "⏳"
        : "❌"
    }
Date: ${date}${tx.hash ? `\nHash: \`${tx.hash}\`` : ""}\n`;
  })
  .join("\n")}
Use /send_to_email to send via email or /withdraw for bank withdrawals.`;

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("« Back to Menu", "main_menu"),
      });
    } catch (error) {
      console.error("Error fetching transfers:", error);
      await ctx.reply(
        "❌ Couldn't fetch your transfers.\n\n" +
          "Please try again or contact support if the issue persists",
        {
          reply_markup: new InlineKeyboard().text(
            "📊 Transactions",
            "transfers"
          ),
        }
      );
    }
  }

  public async handleTransferInput(ctx: Context): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    const userState = this.userStates.get(chatId);
    if (!userState) return;

    const text = ctx.message?.text;
    if (!text) return;

    try {
      switch (userState.action) {
        case "email_transfer":
          if (userState.step === "new_recipient") {
            if (!isValidEmail(text)) {
              await ctx.reply("❌ Invalid email address. Please try again:", {
                reply_markup: createBackToMenuKeyboard(),
              });
              return;
            }

            const saveResult = await savePayee(chatId, {
              email: text,
              nickName: text.split("@")[0],
            });
            if (!saveResult) {
              await ctx.reply(
                "⚠️ Could not save the recipient, but you can still proceed with the transfer.",
                { reply_markup: createBackToMenuKeyboard() }
              );
            }

            try {
              const [balancesResponse, defaultWalletResponse] =
                await Promise.all([
                  getWalletBalances(chatId),
                  getDefaultWallet(chatId),
                ]);

              const balances = balancesResponse;
              const defaultWallet = defaultWalletResponse;

              const defaultWalletBalance = balances.find(
                (w: any) => w.walletId === defaultWallet.id
              );

              let balanceMessage = "No balance found in default wallet";
              if (defaultWalletBalance) {
                balanceMessage = defaultWalletBalance.balances
                  .map(
                    (b: any) => `• ${b.symbol}: ${Number(b.balance).toFixed(2)}`
                  )
                  .join("\n");
              }

              this.userStates.set(chatId, {
                ...userState,
                recipient: text,
                step: "amount",
              });

              await ctx.reply(
                `📧 Recipient: ${text}\n\n` +
                  `💰 *Available Balance:*\n${balanceMessage}\n\n` +
                  `Please enter the amount you want to send:`,
                {
                  parse_mode: "Markdown",
                  reply_markup: createBackToMenuKeyboard(),
                }
              );
            } catch (error) {
              console.error("Error fetching wallet balance:", error);

              this.userStates.set(chatId, {
                ...userState,
                recipient: text,
                step: "amount",
              });

              await ctx.reply(
                `📧 Recipient: ${text}\n\n` +
                  `Please enter the amount you want to send:`,
                { reply_markup: createBackToMenuKeyboard() }
              );
            }
            return;
          }

          if (userState.step === "amount" && userState.recipient) {
            const amount = text.trim();
            if (!isValidAmount(amount)) {
              await ctx.reply(
                '❌ Invalid amount format. Please use format: "100"',
                { reply_markup: createBackToMenuKeyboard() }
              );
              return;
            }

            const numAmount = parseFloat(amount);
            if (numAmount < 1) {
              await ctx.reply(
                "❌ Minimum amount for transfers is 1 USDC.\n\n" +
                  "Please enter a larger amount:",
                { reply_markup: createBackToMenuKeyboard() }
              );
              return;
            }

            this.userStates.set(chatId, {
              ...userState,
              amount,
              symbol: "USDC",
              confirmationPending: true,
              step: "confirmation",
            });

            await this.sendConfirmation(ctx, {
              recipient: userState.recipient,
              amount,
              symbol: "USDC",
              type: "email",
            });
            return;
          }

          if (!userState.recipient && userState.step === "recipient") {
            if (!isValidEmail(text)) {
              await ctx.reply("❌ Invalid email address. Please try again:", {
                reply_markup: createBackToMenuKeyboard(),
              });
              return;
            }

            await savePayee(chatId, {
              email: text,
              nickName: text.split("@")[0],
            });

            this.userStates.set(chatId, {
              ...userState,
              recipient: text,
              step: "amount",
            });
            await this.promptForAmount(ctx, text);
            return;
          }

          break;

        case "wallet_transfer":
          if (!userState.recipient) {
            if (!text.startsWith("0x") || text.length !== 42) {
              await ctx.reply(
                "❌ Invalid wallet address.\n\n" +
                  "Please enter a valid wallet address starting with '0x'",
                {
                  reply_markup: createBackToMenuKeyboard(),
                }
              );
              return;
            }
            this.userStates.set(chatId, { ...userState, recipient: text });
            await ctx.reply("💰 Please enter the amount you want to send:", {
              reply_markup: createBackToMenuKeyboard(),
            });
            return;
          }

          if (!userState.amount) {
            if (!isValidAmount(text)) {
              await ctx.reply(
                "❌ Invalid format.\n\n" + 'Please use format: "100"',
                {
                  reply_markup: createBackToMenuKeyboard(),
                }
              );
              return;
            }

            this.userStates.set(chatId, {
              ...userState,
              amount: text,
              symbol: "USDC",
              confirmationPending: true,
            });

            await this.sendConfirmation(ctx, {
              recipient: userState.recipient,
              amount: text,
              symbol: "USDC",
              type: "wallet",
            });
            return;
          }
          break;

        case "bank_withdrawal":
          if (!userState.amount && userState.bankAccountId) {
            const [amount] = text.split(" ");
            if (!isValidAmount(amount)) {
              await ctx.reply(
                "❌ Invalid format.\n\n" + "Please use format: '100'",
                {
                  reply_markup: createBackToMenuKeyboard(),
                }
              );
              return;
            }

            const numAmount = parseFloat(amount);
            if (numAmount < 50) {
              await ctx.reply(
                "❌ Minimum amount for bank withdrawals is 50 USDC.\n\n" +
                  "Please enter a larger amount:",
                { reply_markup: createBackToMenuKeyboard() }
              );
              return;
            }

            try {
              const quoteResponse = await axios.post(
                `${process.env.COPPERX_API_BASE_URL}/api/quotes/offramp`,
                {
                  amount: (Number(amount) * Math.pow(10, 8)).toString(),
                  currency: "USDC",
                  sourceCountry: "none",
                  destinationCountry: "ind",
                  onlyRemittance: true,
                  preferredBankAccountId: userState.bankAccountId,
                },
                { headers: await authService.getHeaders(chatId) }
              );

              const quote = quoteResponse.data;
              const quoteData = JSON.parse(quote.quotePayload);

              this.userStates.set(chatId, {
                ...userState,
                amount,
                symbol: "USDC",
                quote,
                confirmationPending: true,
              });

              const message = `
💱 *Withdrawal Quote*

Amount: ${amount} USDC
You'll Receive: ${(Number(quoteData.toAmount) / Math.pow(10, 8)).toFixed(
                2
              )} USDC
Exchange Rate: 1 USDC = ${Number(quoteData.rate).toFixed(2)} INR
Fee: ${(Number(quoteData.totalFee) / Math.pow(10, 8)).toFixed(2)} USDC
Arrival Time: ${quote.arrivalTimeMessage}

⚠️ *Important:*
• This quote is valid for a limited time
• Minimum amount: ${(Number(quote.minAmount) / Math.pow(10, 8)).toFixed(2)} USDC
• Maximum amount: ${(Number(quote.maxAmount) / Math.pow(10, 8)).toFixed(2)} USDC

Would you like to proceed with this withdrawal?`;

              await ctx.reply(message, {
                parse_mode: "Markdown",
                reply_markup: createConfirmationKeyboard(),
              });
            } catch (error) {
              console.error("Error getting quote:", error);
              await ctx.reply(
                "❌ Failed to get withdrawal quote.\n\n" +
                  "Please try again or contact support if the issue persists",
                {
                  reply_markup: createBackToMenuKeyboard(),
                }
              );
              this.userStates.delete(chatId);
            }
            return;
          }

          if (userState.confirmationPending && userState.quote) {
            if (text.toLowerCase() === "confirm") {
              try {
                await axios.post(
                  `${process.env.COPPERX_API_BASE_URL}/api/transfers/offramp`,
                  {
                    quotePayload: userState.quote.quotePayload,
                    quoteSignature: userState.quote.quoteSignature,
                  },
                  { headers: await authService.getHeaders(chatId) }
                );

                await ctx.reply(
                  "✅ Withdrawal initiated successfully!\n\n" +
                    "You can track the status in your recent transfers.",
                  {
                    reply_markup: new InlineKeyboard()
                      .text("📊 View Transfers", "transfers")
                      .row()
                      .text("« Back to Menu", "main_menu"),
                  }
                );
              } catch (error) {
                console.error("Error processing withdrawal:", error);
                await ctx.reply(
                  "❌ Withdrawal failed.\n\n" +
                    "Please try again or contact support if the issue persists",
                  {
                    reply_markup: createBackToMenuKeyboard(),
                  }
                );
              }
            } else {
              await ctx.reply("❌ Withdrawal cancelled.", {
                reply_markup: createBackToMenuKeyboard(),
              });
            }
            this.userStates.delete(chatId);
          }
          break;
      }
    } catch (error) {
      console.error("Error processing transfer:", error);
      await ctx.reply(
        "❌ Transfer failed.\n\n" +
          "Please try again or contact support if the issue persists",
        {
          reply_markup: new InlineKeyboard().text("🏦 Retry", "retry"),
        }
      );
      this.userStates.delete(chatId);
    }
  }

  private async sendConfirmation(
    ctx: Context,
    details: {
      recipient: string;
      amount: string;
      symbol: string;
      type: "email" | "wallet" | "bank";
    }
  ) {
    const message = `
⚠️ *Please Confirm Transfer*

To: ${
      details.type === "wallet" ? `\`${details.recipient}\`` : details.recipient
    }
Amount: ${details.amount} ${details.symbol}
${details.type === "wallet" ? "\nPurpose: Self Transfer" : ""}

${
  details.type === "wallet"
    ? `
⚠️ *Important:*
• Make sure the recipient address is correct
• Verify the network matches the recipient
• Transfers cannot be reversed
`
    : ""
}`;

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: createConfirmationKeyboard(),
    });
  }

  public async handleBankWithdrawalAmount(
    ctx: Context,
    text: string
  ): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    const userState = this.userStates.get(chatId);
    if (!userState) return;

    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply(
        "❌ Invalid amount. Please enter a valid positive number:",
        {
          reply_markup: createBackToMenuKeyboard(),
        }
      );
      return;
    }

    if (userState.symbol === "USDC" && amount < 50) {
      await ctx.reply(
        "❌ Minimum amount for bank withdrawals is 50 USDC.\n\n" +
          "Please enter a larger amount:",
        {
          reply_markup: createBackToMenuKeyboard(),
        }
      );
      return;
    }

    userState.amount = amount.toString();
  }

  public async handlePayeeSelection(
    ctx: Context,
    email: string
  ): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    try {
      const [balancesResponse, defaultWalletResponse] = await Promise.all([
        getWalletBalances(chatId),
        getDefaultWallet(chatId),
      ]);

      const balances = balancesResponse;
      const defaultWallet = defaultWalletResponse;

      const defaultWalletBalance = balances.find(
        (w: any) => w.walletId === defaultWallet.id
      );

      let balanceMessage = "No balance found in default wallet";
      if (defaultWalletBalance) {
        balanceMessage = defaultWalletBalance.balances
          .map((b: any) => `• ${b.symbol}: ${Number(b.balance).toFixed(2)}`)
          .join("\n");
      }

      const userState = this.userStates.get(chatId) || {};
      this.userStates.set(chatId, {
        ...userState,
        action: "email_transfer",
        recipient: email,
        step: "amount",
      });

      await ctx.editMessageText(
        `📧 *Send to Email*\n\n` +
          `Recipient: ${email}\n\n` +
          `💰 *Available Balance:*\n${balanceMessage}\n\n` +
          `Please enter the amount you want to send:`,
        {
          parse_mode: "Markdown",
          reply_markup: createBackToMenuKeyboard(),
        }
      );
    } catch (error) {
      console.error("Error fetching wallet balance:", error);

      const userState = this.userStates.get(chatId) || {};
      this.userStates.set(chatId, {
        ...userState,
        action: "email_transfer",
        recipient: email,
        step: "amount",
      });

      await ctx.editMessageText(
        `📧 *Send to Email*\n\n` +
          `Recipient: ${email}\n\n` +
          `Please enter the amount you want to send:`,
        {
          parse_mode: "Markdown",
          reply_markup: createBackToMenuKeyboard(),
        }
      );
    }
  }

  public async handleAddNewRecipient(ctx: Context): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    const userState = this.userStates.get(chatId) || {};
    this.userStates.set(chatId, {
      ...userState,
      action: "email_transfer",
      step: "new_recipient",
    });

    await ctx.editMessageText(
      "📧 *Add New Recipient*\n\n" +
        "Please enter the recipient's email address:",
      {
        parse_mode: "Markdown",
        reply_markup: createBackToMenuKeyboard(),
      }
    );
  }

  private async promptForAmount(
    ctx: Context,
    recipient: string
  ): Promise<void> {
    const chatId = ctx.from?.id;
    if (!chatId) return;

    try {
      const [balancesResponse, defaultWalletResponse] = await Promise.all([
        getWalletBalances(chatId),
        getDefaultWallet(chatId),
      ]);

      const balances = balancesResponse;
      const defaultWallet = defaultWalletResponse;

      const defaultWalletBalance = balances.find(
        (w: any) => w.walletId === defaultWallet.id
      );

      let balanceMessage = "No balance found in default wallet";
      if (defaultWalletBalance) {
        balanceMessage = defaultWalletBalance.balances
          .map((b: any) => `• ${b.symbol}: ${Number(b.balance).toFixed(2)}`)
          .join("\n");
      }

      await ctx.reply(
        `💰 *Available Balance:*\n${balanceMessage}\n\n` +
          `Please enter the amount you want to send:`,
        {
          parse_mode: "Markdown",
          reply_markup: createBackToMenuKeyboard(),
        }
      );
    } catch (error) {
      console.error("Error fetching wallet balance:", error);

      await ctx.reply("💰 Please enter the amount you want to send:", {
        reply_markup: createBackToMenuKeyboard(),
      });
    }
  }
}

export const transferHandler = TransferHandler.getInstance();
