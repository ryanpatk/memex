import { createBrowserRouter } from "react-router-dom";
import RootRoute from "./RootRoute.tsx";
import SignInPage from "../pages/auth/SignInPage.tsx";
import SignUpPage from "../pages/auth/SignUpPage.tsx";
import ProtectedPage from "../pages/ProtectedPage.tsx";
import StreamPage from "../pages/StreamPage.tsx";
import TasksPage from "../pages/TasksPage.tsx";
import SpacePage from "../pages/SpacePage.tsx";
import ProjectPage from "../pages/ProjectPage.tsx";
import StyleguidePage from "../pages/StyleguidePage.tsx";
import MocksPage from "../pages/MocksPage.tsx";
import NotFoundPage from "../pages/404Page.tsx";
import AuthProtectedRoute from "./AuthProtectedRoute.tsx";
import LegacyModuleRedirect from "./LegacyModuleRedirect.tsx";
import OAuthLanding from "./OAuthLanding.tsx";
import MemexShell from "../components/MemexShell.tsx";
import Providers from "../Providers.tsx";
import { LEGACY_HOME_PATH, LIBRARY_PATH, TASKS_PATH } from "../constants/modules.ts";

const router = createBrowserRouter([
  // I recommend you reflect the routes here in the pages folder
  {
    path: "/",
    element: <Providers />,
    children: [
      // `/`: the Journal when signed in (home), sign-in otherwise
      {
        path: "/",
        element: <RootRoute />,
      },
      {
        path: "/auth/sign-in",
        element: <SignInPage />,
      },
      {
        path: "/auth/sign-up",
        element: <SignUpPage />,
      },
      // Auth Protected routes: signed out → /auth/sign-in?next=<requested page>
      {
        path: "/",
        element: <AuthProtectedRoute />,
        children: [
          // memex shell: sidebar (Journal, Library, Tasks, spaces) around the page
          {
            element: <MemexShell />,
            children: [
              {
                path: LIBRARY_PATH,
                element: <StreamPage />,
              },
              {
                // A space: its scoped Journal + board column (decision 14B)
                path: "/spaces/:spaceId",
                element: <SpacePage />,
              },
              {
                path: TASKS_PATH,
                element: <TasksPage />,
              },
            ],
          },
          // Former routes → the Library (with a type filter for the per-primitive ones;
          // /tasks became the Tasks view on 2026-11-01)
          {
            path: LEGACY_HOME_PATH,
            element: <LegacyModuleRedirect />,
          },
          {
            path: "/links",
            element: <LegacyModuleRedirect type="link" />,
          },
          {
            path: "/notes",
            element: <LegacyModuleRedirect type="note" />,
          },
          {
            path: "/spaces",
            element: <LegacyModuleRedirect />,
          },
          // Design-system reference page — deliberately outside the shell
          // and not linked from in-app navigation
          {
            path: "/styleguide",
            element: <StyleguidePage />,
          },
          // Design mocks for choosing directions — unlinked, like /styleguide
          {
            path: "/mocks",
            element: <MocksPage />,
          },
          // GitHub OAuth returns here; continues to the page sign-in started from
          {
            path: "/dashboard",
            element: <OAuthLanding />,
          },
          {
            path: "/project/:projectId",
            element: <ProjectPage />,
          },
          {
            path: "/protected",
            element: <ProtectedPage />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export default router;
