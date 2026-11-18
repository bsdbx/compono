import { useQueryClient } from "@tanstack/react-query";
import { Component, lazy, type ReactNode, Suspense, useEffect } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router";
import { SmallScreen } from "@/components/small-screen";
import { NotFoundError } from "@/lib/navigation";
import AuthLayout from "./(auth)/layout";
import SignInPage from "./(auth)/sign-in/page";
import SignUpPage from "./(auth)/sign-up/page";
import TeamPage from "./[team]/page";
import MembersPage from "./[team]/settings/members/page";
import GeneralSettingsPage from "./[team]/settings/page";
import ErrorPage from "./error";
import JoinPage from "./join/[token]/page";
import NotFound from "./not-found";
import Home from "./page";
import NewTeamPage from "./teams/new/page";

const Editor = lazy(() =>
  import("@/components/editor/editor").then((m) => ({ default: m.Editor })),
);

class PageBoundary extends Component<
  { children: ReactNode; location: string; onRetry: () => void },
  { error: unknown; location: string }
> {
  state = { error: null as unknown, location: this.props.location };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { location: string },
    state: { location: string },
  ) {
    return props.location === state.location
      ? null
      : { location: props.location, error: null };
  }

  render() {
    const { error } = this.state;
    if (error instanceof NotFoundError) return <NotFound />;
    if (error !== null)
      return (
        <ErrorPage
          retry={() => {
            this.props.onRetry();
            this.setState({ error: null });
          }}
        />
      );
    return this.props.children;
  }
}

function Title({ title, children }: { title?: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title ? `${title} · Compono` : "Compono";
  }, [title]);
  return children;
}

export function App() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  return (
    <>
      <div className="hidden flex-1 flex-col lg:flex">
        <PageBoundary
          location={pathname}
          onRetry={() => {
            void queryClient.resetQueries({
              predicate: (query) => query.state.status === "error",
            });
          }}
        >
          <Suspense>
            <Routes>
              <Route
                path="/"
                element={
                  <Title>
                    <Home />
                  </Title>
                }
              />
              <Route
                element={
                  <AuthLayout>
                    <Outlet />
                  </AuthLayout>
                }
              >
                <Route
                  path="/sign-in"
                  element={
                    <Title title="Sign in">
                      <SignInPage />
                    </Title>
                  }
                />
                <Route
                  path="/sign-up"
                  element={
                    <Title title="Create an account">
                      <SignUpPage />
                    </Title>
                  }
                />
              </Route>
              <Route
                path="/teams/new"
                element={
                  <Title title="Set up your team">
                    <NewTeamPage />
                  </Title>
                }
              />
              <Route
                path="/join/:token"
                element={
                  <Title title="Join a team">
                    <JoinPage />
                  </Title>
                }
              />
              <Route
                path="/:team/settings"
                element={
                  <Title title="Team settings">
                    <GeneralSettingsPage />
                  </Title>
                }
              />
              <Route
                path="/:team/settings/members"
                element={
                  <Title title="Members">
                    <MembersPage />
                  </Title>
                }
              />
              <Route
                path="/:team"
                element={
                  <Title>
                    <TeamPage />
                  </Title>
                }
              />
              <Route
                path="/:team/:project/:component?"
                element={
                  <Title>
                    <Editor />
                  </Title>
                }
              />
              <Route
                path="*"
                element={
                  <Title>
                    <NotFound />
                  </Title>
                }
              />
            </Routes>
          </Suspense>
        </PageBoundary>
      </div>
      <div className="flex flex-1 flex-col lg:hidden">
        <SmallScreen />
      </div>
    </>
  );
}
