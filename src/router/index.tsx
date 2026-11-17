import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import RootRoute from "./RootRoute.tsx";
import SignInPage from "../pages/auth/SignInPage.tsx";
import SignUpPage from "../pages/auth/SignUpPage.tsx";
import StreamPage from "../pages/StreamPage.tsx";
import TasksPage from "../pages/TasksPage.tsx";
import SpacePage from "../pages/SpacePage.tsx";
import NotFoundPage from "../pages/404Page.tsx";
import AuthProtectedRoute from "./AuthProtectedRoute.tsx";
import LegacyModuleRedirect from "./LegacyModuleRedirect.tsx";
import OAuthLanding from "./OAuthLanding.tsx";
import MemexShell from "../components/MemexShell.tsx";
import Providers from "../Providers.tsx";
import RouteError from "./RouteError.tsx";
import InboxPage from "../pages/InboxPage.tsx";
import { INBOX_PATH, LEGACY_HOME_PATH, LIBRARY_PATH, TASKS_PATH } from "../constants/modules.ts";

// The component kit: its own chunk (and stylesheet), never part of the app
const StyleguidePage = lazy(() => import("../pages/StyleguidePage.tsx"));

const router = createBrowserRouter([
  // I recommend you reflect the routes here in the pages folder
  {
    path: "/",
    element: <Providers />,
    // A render error anywhere shows a calm panel with Reload, not a blank page
    errorElement: <RouteError />,
    children: [
      // `/`: the Journal when signed in (home), sign-in otherwise
      {
        path: "/",
        element: <RootRoute />,
        errorElement: <RouteError />,
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
          // memex shell: the top bar (Journal, Cards, Tasks, Inbox, account) over the page
          {
            element: <MemexShell />,
            errorElement: <RouteError />,
            children: [
              {
                // A page that fails keeps the top bar: the panel fills the main column
                errorElement: <RouteError variant="panel" />,
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
                  {
                    // The Inbox: agent proposals and filing suggestions
                    path: INBOX_PATH,
                    element: <InboxPage />,
                  },
                ],
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
            element: (
              <Suspense fallback={null}>
                <StyleguidePage />
              </Suspense>
            ),
          },
          // GitHub OAuth returns here; continues to the page sign-in started from
          {
            path: "/dashboard",
            element: <OAuthLanding />,
          },
          // The original template's project page and test page: retired with
          // the classic look (tag classic-design-final), so old links land in
          // the Library
          {
            path: "/project/:projectId",
            element: <LegacyModuleRedirect />,
          },
          {
            path: "/protected",
            element: <LegacyModuleRedirect />,
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
