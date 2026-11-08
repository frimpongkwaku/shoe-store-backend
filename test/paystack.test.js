const test = require("node:test");
const assert = require("node:assert/strict");
const { toPesewas, transactionMatches } = require("../utils/paystack");

test("converts Ghana cedi amounts to pesewas", () => {
    assert.equal(toPesewas(450), 45000);
    assert.equal(toPesewas(12.34), 1234);
});

test("rejects invalid Paystack amounts", () => {
    assert.throws(() => toPesewas(0), /greater than zero/);
    assert.throws(() => toPesewas(Number.NaN), /greater than zero/);
    assert.throws(() => toPesewas(0.001), /supported range/);
});

test("accepts only successful transactions matching reference, amount, currency, and email", () => {
    const expected = { reference: "HELEMAYS_abc", amount: 45000, email: "buyer@example.com" };
    const transaction = {
        status: "success",
        reference: expected.reference,
        amount: expected.amount,
        currency: "GHS",
        customer: { email: "BUYER@example.com" }
    };

    assert.equal(transactionMatches(transaction, expected), true);
    assert.equal(transactionMatches({ ...transaction, amount: 44999 }, expected), false);
    assert.equal(transactionMatches({ ...transaction, reference: "another-reference" }, expected), false);
    assert.equal(transactionMatches({ ...transaction, status: "pending" }, expected), false);
    assert.equal(transactionMatches({ ...transaction, customer: { email: "other@example.com" } }, expected), false);
});
