import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/session';
import { AuthLayout, LoginPage, RegisterPage, ForgotPasswordPage } from './pages/AuthPages';
import { ProtectedLayout, AdminGuard, AwaitingPage } from './components/Shell';
import { ResourcePage, materialDefinition, standardDefinition, farmDefinition, zoneDefinition, treeDefinition, harvestDefinition } from './pages/Resources';
import { CooperativeList, CooperativeDetailPage, CooperativeEditor } from './pages/Cooperatives';
import { PendingManagersPage } from './pages/ManagerApproval';
import { Dashboard } from './pages/Dashboards';
export function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route element={<AuthLayout/>}>
      <Route path="/login" element={<LoginPage/>}/>
      <Route path="/register" element={<RegisterPage/>}/>
      <Route path="/forgot-password" element={<ForgotPasswordPage/>}/>
    </Route>
    <Route element={<ProtectedLayout/>}>
      <Route index element={<Dashboard/>}/>
      <Route path="materials" element={<ResourcePage definition={materialDefinition}/>}/>
      <Route path="materials/:id" element={<ResourcePage definition={materialDefinition}/>}/>
      <Route path="standards" element={<ResourcePage definition={standardDefinition}/>}/>
      <Route path="standards/:id" element={<ResourcePage definition={standardDefinition}/>}/>
      <Route path="farms" element={<ResourcePage definition={farmDefinition}/>}/>
      <Route path="farms/:id" element={<ResourcePage definition={farmDefinition}/>}/>
      <Route path="zones" element={<ResourcePage definition={zoneDefinition}/>}/>
      <Route path="zones/:id" element={<ResourcePage definition={zoneDefinition}/>}/>
      <Route path="trees" element={<ResourcePage definition={treeDefinition}/>}/>
      <Route path="trees/:id" element={<ResourcePage definition={treeDefinition}/>}/>
      <Route path="tree-harvests" element={<ResourcePage definition={harvestDefinition}/>}/>
      <Route path="tree-harvests/:id" element={<ResourcePage definition={harvestDefinition}/>}/>
      <Route path="cooperatives" element={<CooperativeList/>}/>
      <Route path="cooperatives/:id" element={<CooperativeDetailPage/>}/>
      <Route path="iot" element={<AwaitingPage title="Giám sát IoT"/>}/>
      <Route element={<AdminGuard/>}>
        <Route path="cooperatives/new" element={<CooperativeEditor/>}/>
        <Route path="cooperatives/:id/edit" element={<CooperativeEditor/>}/>
        <Route path="pending-managers" element={<PendingManagersPage/>}/>
      </Route>
      <Route path="*" element={<div className="panel"><h1>Không tìm thấy trang</h1><Link to="/">Về tổng quan</Link></div>}/>
    </Route>
  </Routes></AuthProvider></BrowserRouter>;
}
