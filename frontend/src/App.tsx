import { Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import StoryCreatePage from "./pages/StoryCreatePage";
import StoryDetailPage from "./pages/StoryDetailPage";
import SceneDetailPage from "./pages/SceneDetailPage";
import CharactersPage from "./pages/CharactersPage";
import StoriesPage from "./pages/StoriesPage";
import ProductionPage from "./pages/ProductionPage";
import BackgroundsPage from "./pages/BackgroundsPage";
import AssetLibraryPage from "./pages/AssetLibraryPage";
import GoogleFlowPage from "./pages/GoogleFlowPage";
import StorybookViewer from "./components/storybook/StorybookViewer";
import { GoogleFlowConnectionProvider } from "./context/GoogleFlowConnectionContext";

export default function App() {
  return (
    <GoogleFlowConnectionProvider>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<StoryCreatePage />} />
          <Route path="stories/new" element={<StoryCreatePage />} />
          <Route path="stories/:storyId" element={<StoryDetailPage />} />
          <Route path="stories/:storyId/scenes/:sceneId" element={<SceneDetailPage />} />
          <Route path="characters" element={<CharactersPage />} />
          <Route path="backgrounds" element={<BackgroundsPage />} />
          <Route path="assets" element={<AssetLibraryPage />} />
          <Route path="stories" element={<StoriesPage />} />
          <Route path="production" element={<ProductionPage />} />
          <Route path="integrations/google-flow" element={<GoogleFlowPage />} />
          <Route path="google-flow" element={<GoogleFlowPage />} />
          <Route path="story/:storyId/read" element={<StorybookViewer />} />
        </Route>
      </Routes>
    </GoogleFlowConnectionProvider>
  );
}
