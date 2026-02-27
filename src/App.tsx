import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Pages
import AuthPage from "./pages/AuthPage";
import JobCardListPage from "./pages/JobCardListPage";
import JobCardDetailPage from "./pages/JobCardDetailPage";
import CreateJobCardPage from "./pages/CreateJobCardPage";
import ReportsPage from "./pages/ReportsPage";
import ProfilePage from "./pages/ProfilePage";
import ProfileEditPage from "./pages/ProfileEditPage";
import SuperAdminConsolePage from "./pages/SuperAdminConsolePage";
import ManageWorkshopsPage from "./pages/ManageWorkshopsPage";
import ManageCountryAdminsPage from "./pages/ManageCountryAdminsPage";
import SystemConfigPage from "./pages/SystemConfigPage";
import ManageServiceCategoriesPage from "./pages/ManageServiceCategoriesPage";
import FeedbackEditorPage from "./pages/FeedbackEditorPage";
import ManageTeamPage from "./pages/ManageTeamPage";
import ManageSuperAdminsPage from "./pages/ManageSuperAdminsPage";
import ManageSpareMasterPage from "./pages/ManageSpareMasterPage";
import FeedbackPage from "./pages/FeedbackPage";
import ShortLinkRedirect from "./pages/ShortLinkRedirect";
import WarrantyApprovalsPage from "./pages/WarrantyApprovalsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/feedback/:token" element={<FeedbackPage />} />
            <Route path="/f/:code" element={<ShortLinkRedirect />} />
            {/* Protected routes */}
            <Route path="/" element={<ProtectedRoute><JobCardListPage /></ProtectedRoute>} />
            <Route path="/job-card/:id" element={<ProtectedRoute><JobCardDetailPage /></ProtectedRoute>} />
            <Route path="/create" element={<ProtectedRoute><CreateJobCardPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/profile/edit" element={<ProtectedRoute><ProfileEditPage /></ProtectedRoute>} />
            <Route path="/console" element={<ProtectedRoute><SuperAdminConsolePage /></ProtectedRoute>} />
            <Route path="/console/workshops" element={<ProtectedRoute><ManageWorkshopsPage /></ProtectedRoute>} />
            <Route path="/console/country-admins" element={<ProtectedRoute><ManageCountryAdminsPage /></ProtectedRoute>} />
            <Route path="/console/system-config" element={<ProtectedRoute><SystemConfigPage /></ProtectedRoute>} />
            <Route path="/console/service-categories" element={<ProtectedRoute><ManageServiceCategoriesPage /></ProtectedRoute>} />
            <Route path="/console/feedback-editor" element={<ProtectedRoute><FeedbackEditorPage /></ProtectedRoute>} />
            <Route path="/console/spare-parts" element={<ProtectedRoute><ManageSpareMasterPage /></ProtectedRoute>} />
            <Route path="/console/super-admins" element={<ProtectedRoute><ManageSuperAdminsPage /></ProtectedRoute>} />
            <Route path="/manage-team" element={<ProtectedRoute><ManageTeamPage /></ProtectedRoute>} />
            <Route path="/warranty-approvals" element={<ProtectedRoute><WarrantyApprovalsPage /></ProtectedRoute>} />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
