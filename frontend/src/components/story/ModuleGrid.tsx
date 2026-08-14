interface Module {
  name: string;
  icon: string;
  description: string;
}

interface ModuleGridProps {
  modules: Module[];
}

export default function ModuleGrid({ modules }: ModuleGridProps) {
  return (
    <div className="module-grid">
      {modules.map((module) => (
        <div className="module-card" key={module.name}>
          <div className="module-icon">{module.icon}</div>
          <div>
            <h3>{module.name}</h3>
            <p>{module.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
