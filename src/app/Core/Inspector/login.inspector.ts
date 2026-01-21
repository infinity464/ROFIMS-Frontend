// import { HttpInterceptorFn } from '@angular/common/http';
// import { inject } from '@angular/core';
// // import { AuthService } from '../service/auth.service';
// import { Authentication } from '@/Components/Features/Authentication/Service/authentication';

// export const authInterceptor: HttpInterceptorFn = (req, next) => {
//   const auth = inject(Authentication);
//   const token = auth.getAccessToken();

//   const isAuthEndpoint =
//     req.url.includes('/login') ||
//     req.url.includes('/token') ||
//     req.url.includes('/refresh');

//   if (token && !isAuthEndpoint) {
//     req = req.clone({
//       setHeaders: {
//         Authorization: `Bearer ${token}`,
//       },
//     });
//   }

//   return next(req);
// };
