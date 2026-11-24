import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register.component').then(
        (m) => m.RegisterComponent
      ),
  },
  {
    path: 'reset-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/reset-password.component').then(
        (m) => m.ResetPasswordComponent
      ),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'feeds',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/feeds/feed-list.component').then(
        (m) => m.FeedListComponent
      ),
  },
  {
    path: 'recipes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/recipes/recipe-list.component').then(
        (m) => m.RecipeListComponent
      ),
  },
  {
    path: 'recipes/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/recipes/recipe-builder.component').then(
        (m) => m.RecipeBuilderComponent
      ),
  },
  {
    path: 'iofc',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/iofc/iofc.component').then(
        (m) => m.IofcComponent
      ),
  },
  {
    path: 'accuracy',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/accuracy/accuracy.component').then(
        (m) => m.AccuracyComponent
      ),
  },
  {
    path: 'loading',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/loading/loading.component').then(
        (m) => m.LoadingComponent
      ),
  },
  {
    path: 'groups',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/groups/groups.component').then(
        (m) => m.GroupsComponent
      ),
  },
  {
    path: 'inventory',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/inventory.component').then(
        (m) => m.InventoryComponent
      ),
  },
  {
    path: 'targets',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/targets/targets.component').then(
        (m) => m.TargetsComponent
      ),
  },
  {
    path: 'recipes/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/recipes/recipe-builder.component').then(
        (m) => m.RecipeBuilderComponent
      ),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
