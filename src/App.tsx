import { useEffect } from "react";
import { useAppStore } from "./store/appStore";
import { LoginScreen } from "./components/LoginScreen";
import { MainLayout } from "./components/MainLayout";
import { Toaster } from "./components/ui/toaster";

function App() {
  const { isAuthenticated, checkAuth } = useAppStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="h-screen w-screen overflow-hidden">
      {isAuthenticated ? <MainLayout /> : <LoginScreen />}
      <Toaster />
    </div>
  );
}

export default App;
