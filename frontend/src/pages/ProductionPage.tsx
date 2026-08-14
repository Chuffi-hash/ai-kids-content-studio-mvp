import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProductionPipeline from '../components/production/ProductionPipeline';
import { ProductionState } from '../types/production';
import { Scene } from '../types/story';

export default function ProductionPage() {
  const navigate = useNavigate();
  const [productionState, setProductionState] = useState<ProductionState | null>(null);

  function goToGenerator() {
    navigate('/');
  }

  function handleProductionStateChange(newState: ProductionState) {
    setProductionState(newState);
  }

  return (
    <div className="production-page">
      <div className="production-page-header">
        <button
          className="production-back-btn"
          onClick={goToGenerator}
        >
          ← Back to Story Generator
        </button>
      </div>
      {productionState ? (
        <ProductionPipeline 
          productionState={productionState} 
          onProductionStateChange={handleProductionStateChange}
        />
      ) : (
        <div className="production-empty-state">
          <div className="production-empty-icon">🎬</div>
          <h3>No production in progress</h3>
          <p className="muted">Generate a story and scenes first to start production.</p>
          <button
            className="primary"
            onClick={goToGenerator}
          >
            Go to Story Generator
          </button>
        </div>
      )}
    </div>
  );
}
