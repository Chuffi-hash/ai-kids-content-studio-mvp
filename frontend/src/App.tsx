import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import CharactersPage from './pages/CharactersPage';
import StoriesPage from './pages/StoriesPage';
import ProductionPage from './pages/ProductionPage';
import StorybookViewer from './components/storybook/StorybookViewer';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="characters" element={<CharactersPage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="production" element={<ProductionPage />} />
      </Route>
      <Route path="/story/:storyId/read" element={<StorybookViewer />} />
    </Routes>
  );
}
