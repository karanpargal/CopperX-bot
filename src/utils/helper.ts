export const getTypeEmoji = (type: string) => {
  switch (type.toLowerCase()) {
    case "deposit":
      return "📥";
    case "withdraw":
      return "📤";
    case "send":
      return "➡️";
    case "receive":
      return "⬅️";
    default:
      return "💸";
  }
};

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidAmount = (amount: string): boolean => {
  return !isNaN(Number(amount)) && Number(amount) > 0;
};

export const formatBalances = (balances: any[]) => {
  return balances
    .map((wallet: any) =>
      wallet.balances
        .map((b: any) => `• ${b.symbol}: ${Number(b.balance).toFixed(6)}`)
        .join("\n")
    )
    .join("\n");
};
