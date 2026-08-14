import { ProductionState } from '../../types/production';

interface PipelineProgressProps {
  currentStage: ProductionState['currentStage'];
}

const stages = [
  { key: 'story', label: 'Story' },
  { key: 'scenes', label: 'Scenes' },
  { key: 'images', label: 'Images' },
  { key: 'voice', label: 'Voice' },
  { key: 'animation', label: 'Animation' },
  { key: 'assembly', label: 'Assembly' },
] as const;

function getStageStatus(stageKey: string, currentStage: ProductionState['currentStage']) {
  const stageOrder = ['story', 'scenes', 'images', 'voice', 'animation', 'assembly', 'complete'];
  const currentIndex = stageOrder.indexOf(currentStage);
  const stageIndex = stageOrder.indexOf(stageKey);

  if (stageIndex < currentIndex) return 'completed';
  if (stageIndex === currentIndex) return 'current';
  return 'pending';
}

export default function PipelineProgress({ currentStage }: PipelineProgressProps) {
  return (
    <div className="pipeline-progress">
      {stages.map((stage, index) => {
        const status = getStageStatus(stage.key, currentStage);
        return (
          <div key={stage.key} className={`pipeline-step pipeline-step--${status}`}>
            <div className="pipeline-step-indicator">
              {status === 'completed' && '✓'}
              {status === 'current' && '●'}
              {status === 'pending' && '○'}
            </div>
            <span className="pipeline-step-label">{stage.label}</span>
            {index < stages.length - 1 && <div className="pipeline-step-connector" />}
          </div>
        );
      })}
    </div>
  );
}
