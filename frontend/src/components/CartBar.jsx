import React from 'react';

function CartBar({ total, itemCount, onCheckout, submitting, onClear }) {
  return (
    <div className="cart-bar">
      <div className="cart-info">
        <div className="cart-item-count">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </div>
        <div className="cart-total">${total.toFixed(2)}</div>
      </div>
      <div className="cart-actions">
        <button className="cart-clear" onClick={onClear} disabled={submitting} aria-label="Clear cart">
          Clear
        </button>
        <button 
          className="checkout-btn" 
          onClick={onCheckout} 
          disabled={submitting || itemCount === 0}
        >
          {submitting ? 'Submitting...' : 'View cart'}
        </button>
      </div>
    </div>
  );
}

export default CartBar;