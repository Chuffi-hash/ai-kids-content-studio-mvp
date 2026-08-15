import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ProductionPipeline from "../components/production/ProductionPipeline";
import { ProductionState } from "../types/production";
import "../components/production/production-pipeline.css";

type LocationState = {
  productionState?: ProductionState;
};

export default function ProductionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const [productionState, setProductionState] =
    useState<ProductionState | null>(locationState?.productionState ?? null);

  function goToGenerator() {
    navigate("/");
  }

  function handleProductionStateChange(newState: ProductionState) {
    setProductionState(newState);
  }

  return (
    <div className="production-page">
      {productionState ? (
        <ProductionPipeline
          productionState={productionState}
          onProductionStateChange={handleProductionStateChange}
        />
      ) : (
        <div className="production-empty-state">
          <h3>No production in progress</h3>
          <p className="muted">
            Generate a story and scenes first to start production.
          </p>
          <button className="btn btn-primary" onClick={goToGenerator}>
            Go to Story Generator
          </button>
        </div>
      )}
    </div>
  );
}
