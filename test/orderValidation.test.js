const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeInventory, buildVerifiedOrderItems } = require("../utils/orderValidation");

const product = {
    _id: "65a000000000000000000001",
    name: "Leather Sandal",
    price: 450,
    available: true,
    sizes: ["40:2", "41:1"],
    colors: ["Black", "Brown"]
};

test("normalizes legacy and structured inventory entries", () => {
    assert.deepEqual(normalizeInventory(["40:2", { size: 41, stock: 1 }]), [
        { size: "40", stock: 2 },
        { size: "41", stock: 1 }
    ]);
});

test("builds order lines using the catalog price instead of submitted names", () => {
    const [item] = buildVerifiedOrderItems([{
        productId: product._id,
        name: "Forged product name",
        expectedPrice: 450,
        qty: 1,
        size: "40",
        color: "black"
    }], [product]);

    assert.deepEqual(item, {
        productId: product._id,
        name: "Leather Sandal",
        price: 450,
        qty: 1,
        size: "40",
        color: "Black"
    });
});

test("rejects stale prices and provides the current catalog price", () => {
    assert.throws(
        () => buildVerifiedOrderItems([{
            productId: product._id,
            expectedPrice: 400,
            qty: 1,
            size: "40",
            color: "Black"
        }], [product]),
        error => error.status === 409 && error.code === "PRICE_CHANGED" && error.currentPrice === 450
    );
});

test("rejects quantities above current stock", () => {
    assert.throws(
        () => buildVerifiedOrderItems([{ productId: product._id, expectedPrice: 450, qty: 3, size: "40", color: "Black" }], [product]),
        { status: 409, message: /Only 2 unit/ }
    );
});

test("rejects unavailable sizes and colors", () => {
    assert.throws(
        () => buildVerifiedOrderItems([{ productId: product._id, expectedPrice: 450, qty: 1, size: "45", color: "Black" }], [product]),
        { status: 409, message: /not available in size 45/ }
    );
    assert.throws(
        () => buildVerifiedOrderItems([{ productId: product._id, expectedPrice: 450, qty: 1, size: "40", color: "Green" }], [product]),
        { status: 409, message: /selected color/ }
    );
});
