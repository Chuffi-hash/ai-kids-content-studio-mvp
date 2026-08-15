import { Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import StoryCreatePage from "./pages/StoryCreatePage";
import StoryDetailPage from "./pages/StoryDetailPage";
import SceneDetailPage from "./pages/SceneDetailPage";
import CharactersPage from "./pages/CharactersPage";
import StoriesPage from "./pages/StoriesPage";
import ProductionPage from "./pages/ProductionPage";
import StorybookViewer from "./components/storybook/StorybookViewer";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<StoryCreatePage />} />
        <Route path="stories/new" element={<StoryCreatePage />} />
        <Route path="stories/:storyId" element={<StoryDetailPage />} />
        <Route path="stories/:storyId/scenes/:sceneId" element={<SceneDetailPage />} />
        <Route path="characters" element={<CharactersPage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="story/:storyId/read" element={<StorybookViewer />} />
      </Route>
    </Routes>
  );
}
