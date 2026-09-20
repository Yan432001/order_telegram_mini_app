import React from 'react';

function ProductCard({ product, quantity, onAdd, onRemove }) {
  const isOutOfStock = !product.is_available || product.stock_quantity <= 0;
  const price = product.sale_price ?? product.price;
  const hasSale = product.sale_price && product.sale_price < product.price;

  return (
    <div className="card">
      <img 
        src={product.image || '/placeholder.png'} 
        alt={product.name}
        loading="lazy"
        onError={(e) => e.target.src = '/placeholder.png'}
      />
      <div className="card-body">
        <div className="card-title">{product.name}</div>
        <div className="card-desc">{product.description || 'No description'}</div>
        <div className="card-footer">
          <span className="price">
            {hasSale ? (
              <>
                <s>${product.price.toFixed(2)}</s> ${product.sale_price.toFixed(2)}
              </>
            ) : (
              `$${product.price.toFixed(2)}`
            )}
          </span>
          {isOutOfStock ? (
            <span className="out-of-stock">Out of Stock</span>
          ) : quantity > 0 ? (
            <div className="counter">
              <button className="counter-btn" onClick={() => onRemove(product.id)}>-</button>
              <span className="count-val">{quantity}</span>
              <button className="counter-btn" onClick={() => onAdd(product)}>+</button>
            </div>
          ) : (
            <button className="add-btn" onClick={() => onAdd(product)}>Add</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductCard;