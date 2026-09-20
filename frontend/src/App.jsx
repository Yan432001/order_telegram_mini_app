import React, { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import ProductCard from './components/ProductCard';
import CartBar from './components/CartBar';
import CategoryChips from './components/CategoryChips';
import useTelegram from './hooks/useTelegram';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

// Polyfill for crypto.randomUUID if not available
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function App() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkout, setCheckout] = useState({
    orderType: 'pickup',
    phone: '',
    address: '',
    note: '',
    paymentMethod: 'cash'
  });

  const { tg, user, initData, isReady } = useTelegram();
  const idempotencyKeyRef = useRef(generateUUID());

  const loadMenu = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [catsRes, prodsRes] = await Promise.all([
        fetch(`${API_BASE}/api/categories`),
        fetch(`${API_BASE}/api/products`)
      ]);
      
      if (!catsRes.ok || !prodsRes.ok) {
        throw new Error('Failed to load menu');
      }
      
      const [cats, prods] = await Promise.all([
        catsRes.json(),
        prodsRes.json()
      ]);
      
      setCategories(cats);
      setProducts(prods);
    } catch (err) {
      console.error('Error fetching menu:', err);
      setError('Failed to load menu. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      loadMenu();
    }
  }, [isReady, loadMenu]);

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'All' || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  }).sort((a, b) => {
    if (sortBy === 'price-low') return (a.sale_price ?? a.price) - (b.sale_price ?? b.price);
    if (sortBy === 'price-high') return (b.sale_price ?? b.price) - (a.sale_price ?? a.price);
    return a.sort_order - b.sort_order;
  });

  const addToCart = (product) => {
    if (!product.is_available || product.stock_quantity <= 0) return;
    setCart(prev => ({
      ...prev,
      [product.id]: { 
        ...product, 
        quantity: (prev[product.id]?.quantity || 0) + 1 
      }
    }));
  };

  const removeFromCart = (id) => {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[id].quantity > 1) {
        updated[id] = { ...updated[id], quantity: updated[id].quantity - 1 };
      } else {
        delete updated[id];
      }
      return updated;
    });
  };

  const clearCart = () => {
    setCart({});
  };

  const cartItems = Object.values(cart);
  const displayTotal = cartItems.reduce(
    (acc, item) => acc + (item.sale_price ?? item.price) * item.quantity, 
    0
  );
  const totalItemCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const openCheckout = () => {
    if (cartItems.length === 0 || submitting) return;

    // Check if any item is out of stock
    const outOfStock = cartItems.some(item => !item.is_available || item.stock_quantity <= 0);
    if (outOfStock) {
      tg?.showAlert('Some items in your cart are no longer available. Please remove them and try again.');
      return;
    }
    setShowCheckout(true);
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0 || submitting) return;

    if (!initData) {
      tg?.showAlert('Please open this app from Telegram to place an order.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData
        },
        body: JSON.stringify({
          items: cartItems.map(i => ({ id: i.id, quantity: i.quantity })),
          idempotency_key: idempotencyKeyRef.current,
          payment_method: checkout.paymentMethod,
          phone: checkout.phone,
          delivery_address: checkout.orderType === 'delivery' ? checkout.address : '',
          note: checkout.note
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server returned an error');

      tg?.showAlert(`Order ${data.orderNumber} submitted successfully!`);
      setCart({});
      setShowCheckout(false);
      setCheckout({ orderType: 'pickup', phone: '', address: '', note: '', paymentMethod: 'cash' });
      idempotencyKeyRef.current = generateUUID();
    } catch (error) {
      tg?.showAlert(error.message || 'Order submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isReady) {
    return <div className="loading">Initializing...</div>;
  }

  if (error) {
    return (
      <div className="error-state">
        <p>{error}</p>
        <button className="retry-btn" onClick={loadMenu}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <header className="header">
        <div className="brand">
          <div className="brand-mark">☕</div>
          <div>
            <p className="eyebrow">WELCOME TO</p>
            <h1>Quick E-Menu</h1>
          </div>
        </div>
        <div className="user-badge">{user ? `Hi, ${user.first_name}` : 'Guest'}</div>
      </header>

      <section className="hero">
        <div>
          <p className="hero-kicker">FRESH • FAST • DELICIOUS</p>
          <h2>Your favorites,<br /><span>made for you.</span></h2>
          <p className="hero-copy">Order ahead and enjoy every bite without the wait.</p>
        </div>
        <div className="hero-art" aria-hidden="true">🥐</div>
      </section>

      <div className="menu-heading">
        <div>
          <p className="section-kicker">OUR MENU</p>
          <h2>What are you craving?</h2>
        </div>
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort menu">
          <option value="popular">Popular</option>
          <option value="price-low">Price: low</option>
          <option value="price-high">Price: high</option>
        </select>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="🔍 Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <CategoryChips
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {loading ? (
        <div className="loading">Loading menu...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-state">
          <p>No products found.</p>
          <p className="empty-hint">Try another category or search term.</p>
        </div>
      ) : (
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              quantity={cart[product.id]?.quantity || 0}
              onAdd={addToCart}
              onRemove={removeFromCart}
            />
          ))}
        </div>
      )}

      {cartItems.length > 0 && (
        <CartBar
          total={displayTotal}
          itemCount={totalItemCount}
          onCheckout={openCheckout}
          submitting={submitting}
          onClear={clearCart}
        />
      )}

      {showCheckout && (
        <div className="sheet-backdrop" onClick={() => !submitting && setShowCheckout(false)}>
          <section className="checkout-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div>
                <p className="section-kicker">ALMOST THERE</p>
                <h2>Complete your order</h2>
              </div>
              <button className="close-btn" onClick={() => setShowCheckout(false)} aria-label="Close">×</button>
            </div>
            <div className="order-total-row">
              <span>{totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}</span>
              <strong>${displayTotal.toFixed(2)}</strong>
            </div>
            <div className="choice-row">
              <button className={checkout.orderType === 'pickup' ? 'choice active' : 'choice'} onClick={() => setCheckout({ ...checkout, orderType: 'pickup' })}>🏃 Pickup</button>
              <button className={checkout.orderType === 'delivery' ? 'choice active' : 'choice'} onClick={() => setCheckout({ ...checkout, orderType: 'delivery' })}>🛵 Delivery</button>
            </div>
            <label className="field-label">Phone number
              <input className="field" value={checkout.phone} onChange={(e) => setCheckout({ ...checkout, phone: e.target.value })} placeholder="+1 555 000 0000" />
            </label>
            {checkout.orderType === 'delivery' && (
              <label className="field-label">Delivery address
                <input className="field" value={checkout.address} onChange={(e) => setCheckout({ ...checkout, address: e.target.value })} placeholder="Street, building, apartment" />
              </label>
            )}
            <label className="field-label">Note for the kitchen <span>(optional)</span>
              <textarea className="field textarea" value={checkout.note} onChange={(e) => setCheckout({ ...checkout, note: e.target.value })} placeholder="Extra napkins, no sugar..." rows="2" />
            </label>
            <label className="field-label">Payment
              <select className="field" value={checkout.paymentMethod} onChange={(e) => setCheckout({ ...checkout, paymentMethod: e.target.value })}>
                <option value="cash">Cash on {checkout.orderType}</option>
                <option value="card">Card on {checkout.orderType}</option>
              </select>
            </label>
            <button className="sheet-submit" onClick={handleCheckout} disabled={submitting}>
              {submitting ? 'Sending order...' : `Place order · $${displayTotal.toFixed(2)}`}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}