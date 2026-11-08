const toPesewas = amount => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error("The payment amount must be greater than zero.");
    }
    const pesewas = Math.round(numericAmount * 100);
    if (!Number.isSafeInteger(pesewas) || pesewas < 1) {
        throw new Error("The payment amount is outside the supported range.");
    }
    return pesewas;
};

const transactionMatches = (transaction, expected) =>
    transaction?.status === "success" &&
    transaction.reference === expected.reference &&
    Number(transaction.amount) === expected.amount &&
    String(transaction.currency).toUpperCase() === "GHS" &&
    String(transaction.customer?.email || "").trim().toLowerCase() === expected.email.toLowerCase();

module.exports = { toPesewas, transactionMatches };
