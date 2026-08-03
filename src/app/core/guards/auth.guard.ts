import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { map, take } from 'rxjs/operators';

/**
 * Route guard that redirects unauthenticated users to /login.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map((firebaseUser) => {
      if (firebaseUser) {
        return true;
      }
      return router.createUrlTree(['/login']);
    })
  );
};

/**
 * Route guard that redirects authenticated users away from login/register.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map((firebaseUser) => {
      if (!firebaseUser) {
        return true;
      }
      return router.createUrlTree(['/dashboard']);
    })
  );
};
