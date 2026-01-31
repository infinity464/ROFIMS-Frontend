# ROFIMS Frontend Application - Complete Knowledge Guide

> **IMPORTANT**: Always read and follow this guide before starting any design or development work.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Configuration Files](#4-configuration-files)
5. [Entry Points & Bootstrap](#5-entry-points--bootstrap)
6. [Routing Architecture](#6-routing-architecture)
7. [State Management](#7-state-management)
8. [Component Patterns](#8-component-patterns)
9. [Styling System](#9-styling-system)
10. [API & Data Fetching](#10-api--data-fetching)
11. [Authentication System](#11-authentication-system)
12. [Form Handling Patterns](#12-form-handling-patterns)
13. [Type Definitions & Models](#13-type-definitions--models)
14. [Custom Utilities & Helpers](#14-custom-utilities--helpers)
15. [Testing Setup](#15-testing-setup)
16. [Code Quality Standards](#16-code-quality-standards)
17. [Design Guidelines](#17-design-guidelines)
18. [Development Workflow](#18-development-workflow)

---

## 1. Project Overview

### Application Identity
- **Name**: ROFIMS Frontend (based on Sakai-NG template)
- **Package Name**: `sakai-ng`
- **Version**: 20.0.0
- **Type**: Enterprise Angular Application
- **Purpose**: Employee Information Management System

### Key Features
- Employee management with complete profiles
- Personal information tracking (family, education, nominees)
- Address management (multiple types)
- Organization/Master data setup
- JWT-based authentication
- Role-based access control
- Dark/Light theme support
- Responsive design

---

## 2. Technology Stack

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| Angular | 20 | Frontend framework |
| TypeScript | 5.8.3 | Type-safe JavaScript |
| RxJS | 7.8.2 | Reactive programming |

### UI Components
| Library | Version | Purpose |
|---------|---------|---------|
| PrimeNG | 20 | UI component library |
| PrimeIcons | 7.0.0 | Icon library |
| PrimeUX | 1.2.1 | Theme system |
| Aura Theme | Latest | Default theme preset |

### Styling
| Tool | Version | Purpose |
|------|---------|---------|
| Tailwind CSS | 4.1.11 | Utility-first CSS |
| SCSS | - | Component styles |
| PostCSS | 8.5.6 | CSS transformations |
| Autoprefixer | 10.4.20 | Browser compatibility |

### Build & Development
| Tool | Purpose |
|------|---------|
| Angular CLI | Build, serve, generate |
| Angular DevKit | Build system |
| ESLint 9.30.1 | Code linting |
| Prettier 3.6.2 | Code formatting |

### Testing
| Tool | Version | Purpose |
|------|---------|---------|
| Jasmine | 5.8.0 | Testing framework |
| Karma | 6.4.4 | Test runner |
| Chrome Launcher | - | Browser testing |

---

## 3. Project Structure

```
src/
├── app/
│   ├── Components/
│   │   ├── basic-setup/              # Master data setup modules
│   │   │   ├── mother-org/           # Organization management
│   │   │   ├── Models/               # Shared models
│   │   │   ├── Services/             # Shared services
│   │   │   └── shared/               # Shared components
│   │   │
│   │   └── Features/
│   │       ├── Authentication/       # Login/Logout components
│   │       ├── EmployeeInfo/         # Employee management
│   │       ├── PersonalInfo/         # Personal details (family, education)
│   │       └── Shared/               # Reusable components & address
│   │
│   ├── Core/
│   │   ├── Environments/             # environment.ts, environment.prod.ts
│   │   ├── Guard/                    # auth.guard.ts
│   │   └── Interceptor/              # HTTP interceptors
│   │
│   ├── layout/
│   │   ├── component/                # Layout components
│   │   │   ├── app.layout.ts         # Main layout wrapper
│   │   │   ├── app.topbar.ts         # Header component
│   │   │   ├── app.sidebar.ts        # Sidebar wrapper
│   │   │   ├── app.menu.ts           # Navigation menu
│   │   │   ├── app.menuitem.ts       # Menu item (recursive)
│   │   │   ├── app.footer.ts         # Footer component
│   │   │   └── app.configurator.ts   # Theme config panel
│   │   └── service/
│   │       └── layout.service.ts     # Layout state management
│   │
│   └── pages/                        # Page components
│       ├── dashboard/                # Main dashboard
│       ├── landing/                  # Public landing page
│       ├── auth/                     # Auth-related pages
│       └── uikit/                    # UI Kit demos
│
├── assets/
│   ├── styles.scss                   # Global styles entry
│   ├── tailwind.css                  # Tailwind configuration
│   ├── layout/                       # Layout SCSS modules
│   │   ├── _variables/               # Theme variables
│   │   ├── _core.scss
│   │   ├── _main.scss
│   │   ├── _topbar.scss
│   │   ├── _menu.scss
│   │   ├── _responsive.scss
│   │   └── layout.scss               # Main layout entry
│   └── demo/                         # Demo-specific styles
│
├── public/                           # Public assets
├── main.ts                           # Application bootstrap
├── app.component.ts                  # Root component
├── app.config.ts                     # Application configuration
├── app.routes.ts                     # Route definitions
└── index.html                        # HTML entry point
```

### Key Directories Explained

| Directory | Purpose | When to Use |
|-----------|---------|-------------|
| `Components/Features/` | Business feature modules | New features, CRUD operations |
| `Components/basic-setup/` | Master data management | Configuration, setup pages |
| `Core/` | Application core services | Auth, interceptors, guards |
| `layout/` | Application shell/frame | Layout modifications |
| `pages/` | Standalone pages | Dashboard, landing, errors |
| `assets/layout/` | Layout SCSS files | Styling changes |

---

## 4. Configuration Files

### Primary Configuration

| File | Purpose | Key Settings |
|------|---------|--------------|
| `angular.json` | Angular CLI config | Build targets, assets, styles |
| `tsconfig.json` | TypeScript config | Strict mode, ES2022 target |
| `package.json` | Dependencies & scripts | npm run commands |
| `eslint.config.js` | Linting rules | Angular-specific rules |
| `.prettierrc.json` | Formatting rules | 4-space indent, 250 char width |
| `.postcssrc.json` | PostCSS config | Tailwind plugin |
| `vercel.json` | Deployment config | SPA rewrites |

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "target": "ES2022",
    "module": "ES2022"
  },
  "angularCompilerOptions": {
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  }
}
```

### Path Aliases
```typescript
// Available import alias
import { SomeService } from '@/Core/Services/some.service';
// Maps to: src/app/Core/Services/some.service.ts
```

---

## 5. Entry Points & Bootstrap

### Application Bootstrap Flow

```
index.html
    └── main.ts
        └── bootstrapApplication(AppComponent, appConfig)
            ├── app.component.ts (Root component with RouterOutlet)
            └── app.config.ts (Configuration)
                ├── provideHttpClient(withInterceptors([AuthInterceptor]))
                ├── provideRouter(routes)
                ├── providePrimeNG({ theme: { preset: Aura } })
                └── provideAnimationsAsync()
```

### main.ts
```typescript
bootstrapApplication(AppComponent, appConfig)
    .catch((err) => console.error(err));
```

### app.config.ts
```typescript
export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(withInterceptors([AuthInterceptor])),
        provideRouter(routes, withInMemoryScrolling({
            scrollPositionRestoration: 'enabled',
            anchorScrolling: 'enabled'
        })),
        providePrimeNG({
            theme: {
                preset: Aura,
                options: { darkModeSelector: '.app-dark' }
            }
        }),
        provideAnimationsAsync()
    ]
};
```

---

## 6. Routing Architecture

### Route Structure

```
Routes Configuration (app.routes.ts)
│
├── PUBLIC ROUTES (No Auth Required)
│   ├── /login          → LoginComponent
│   └── /landing        → LandingComponent
│
├── PROTECTED ROUTES (AuthGuard)
│   └── / (AppLayout)
│       ├── /dashboard           → DashboardComponent
│       ├── /employee-info       → EmployeeinfoComponent
│       ├── /personal-info       → PersonalInfoComponent
│       ├── /basic-setup/mother-org → MotherOrgComponent
│       ├── /uikit/*             → Lazy-loaded UI Kit modules
│       ├── /documentation       → DocumentationComponent
│       └── /pages/*             → Lazy-loaded page modules
│
└── ERROR ROUTES
    ├── /notfound       → NotfoundComponent
    └── /**             → Redirect to /notfound
```

### Route Guard Implementation
```typescript
// auth.guard.ts
export const AuthGuard: CanActivateFn = (route, state) => {
    const auth = inject(AuthenticationService);
    const router = inject(Router);

    if (auth.isLoggedIn()) {
        return true;
    }
    router.navigate(['/login']);
    return false;
};
```

### Adding New Routes

1. **Protected Route** (requires authentication):
```typescript
// In app.routes.ts, inside AppLayout children
{
    path: 'new-feature',
    component: NewFeatureComponent
}
```

2. **Public Route**:
```typescript
// In app.routes.ts, at root level
{
    path: 'public-page',
    component: PublicPageComponent
}
```

3. **Lazy-Loaded Route**:
```typescript
{
    path: 'feature',
    loadChildren: () => import('./Components/Features/feature/feature.routes')
        .then(m => m.featureRoutes)
}
```

---

## 7. State Management

### Signal-Based State (Angular Signals)

The application uses Angular Signals for reactive state management.

#### LayoutService State
```typescript
// layout.service.ts
private _layoutConfig = signal<layoutConfig>({
    preset: 'Aura',
    primary: 'noir',
    surface: null,
    darkTheme: false,
    menuMode: 'static'
});

private _layoutState = signal<LayoutState>({
    staticMenuDesktopInactive: false,
    overlayMenuActive: false,
    configSidebarVisible: false,
    staticMenuMobileActive: false,
    menuHoverActive: false
});

// Computed signals
theme = computed(() => this.layoutConfig().darkTheme ? 'dark' : 'light');
isDarkTheme = computed(() => this.layoutConfig().darkTheme);
isSidebarActive = computed(() =>
    this.layoutState().overlayMenuActive ||
    this.layoutState().staticMenuMobileActive
);
```

#### State Update Patterns
```typescript
// Updating signal state
this.layoutService.layoutConfig.update((config) => ({
    ...config,
    darkTheme: true
}));

// Reading signal state
const isDark = this.layoutService.isDarkTheme();
```

### Session State (localStorage)
```typescript
// Stored keys
localStorage.setItem('auth', JSON.stringify(loginResponse));
localStorage.setItem('token', loginResponse.token);
localStorage.setItem('refreshToken', loginResponse.refreshToken);
```

### No Centralized Store
- No NgRx, Akita, or similar state management library
- Components fetch data directly via services
- Use RxJS Observables for async state

---

## 8. Component Patterns

### Standalone Component Structure

All components use the standalone pattern:

```typescript
@Component({
    selector: 'app-feature-name',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        // PrimeNG modules
        TableModule,
        ButtonModule,
        InputTextModule,
        // Other imports
    ],
    templateUrl: './feature-name.html',
    styleUrl: './feature-name.scss',
    providers: [FeatureService]
})
export class FeatureNameComponent implements OnInit {
    // Component logic
}
```

### Component Categories

#### 1. Layout Components
Located in `/layout/component/`
- `AppLayout` - Main wrapper with sidebar/content areas
- `AppTopbar` - Header with branding, user menu, theme toggle
- `AppSidebar` - Sidebar wrapper
- `AppMenu` - Navigation menu items
- `AppMenuitem` - Recursive menu item
- `AppFooter` - Footer content
- `AppConfigurator` - Theme configuration panel

#### 2. Feature Components
Located in `/Components/Features/`

**Authentication:**
- `Login` - Login form with validation
- `Logout` - Logout functionality

**Employee Management:**
- `Employeeinfo` - Complex CRUD with tabs, forms, address management

**Personal Information:**
- `PersonalInfo` - Tabbed interface
- `FamilyInfo` - Family member management
- `NomineeInfo` - Nominee management
- `EducationInfo` - Education records

#### 3. Shared Components
Located in `/Components/Features/Shared/`
- `AddressSectionComponent` - Reusable address form
- `DynamicFieldComponent` - Generic form field renderer

### Component Communication

```typescript
// Parent to Child - @Input()
@Input() employeeId: number;

// Child to Parent - @Output()
@Output() onSave = new EventEmitter<Employee>();

// Service Communication
constructor(private employeeService: EmployeeService) {}

// ViewChild Reference
@ViewChild('addressForm') addressForm: AddressSectionComponent;
```

### Component Template Patterns

```html
<!-- Conditional Rendering -->
<div *ngIf="isLoading">Loading...</div>
<div *ngIf="data">{{ data.name }}</div>

<!-- List Rendering -->
<tr *ngFor="let item of items">
    <td>{{ item.name }}</td>
</tr>

<!-- Two-way Binding -->
<input [(ngModel)]="searchTerm" />

<!-- Event Binding -->
<button (click)="onSubmit()">Submit</button>

<!-- Form Binding -->
<form [formGroup]="myForm" (ngSubmit)="onSubmit()">
    <input formControlName="fieldName" />
</form>
```

---

## 9. Styling System

### Multi-Layer Architecture

```
Layer 1: Tailwind CSS (Utility Classes)
    └── Responsive, spacing, colors, typography

Layer 2: PrimeNG Theme (Aura)
    └── Component-specific styling, theming

Layer 3: Layout SCSS (Application Shell)
    └── Topbar, sidebar, menu, footer

Layer 4: Component SCSS (Feature-specific)
    └── Individual component styles
```

### Global Styles Entry
```scss
// src/assets/styles.scss
@use './tailwind.css';
@use './layout/layout.scss';
@use 'primeicons/primeicons.css';
@use './demo/demo.scss';
```

### Tailwind CSS Configuration
```css
/* src/assets/tailwind.css */
@import 'tailwindcss';
@import 'primeui/primeui.css';

@theme {
    --breakpoint-sm: 576px;
    --breakpoint-md: 768px;
    --breakpoint-lg: 992px;
    --breakpoint-xl: 1200px;
    --breakpoint-2xl: 1920px;
}

@custom-variant app-dark (&:where(.app-dark, .app-dark *));
```

### Layout SCSS Structure
```
src/assets/layout/
├── variables/
│   ├── _common.scss      # Shared variables
│   ├── _light.scss       # Light theme colors
│   └── _dark.scss        # Dark theme colors
├── _core.scss            # Base layout styling
├── _main.scss            # Main content area
├── _topbar.scss          # Header styling
├── _menu.scss            # Sidebar menu
├── _footer.scss          # Footer
├── _responsive.scss      # Media queries
├── _typography.scss      # Font styles
├── _utils.scss           # Utility classes
├── _mixins.scss          # SCSS mixins
└── layout.scss           # Main entry point
```

### Dark Mode Support
```typescript
// Toggle dark mode
document.documentElement.classList.toggle('app-dark');

// CSS targeting
.app-dark {
    /* Dark mode styles */
}

// Tailwind dark variant
@custom-variant app-dark (&:where(.app-dark, .app-dark *));
```

### Responsive Breakpoints
```css
/* Usage with Tailwind */
<div class="grid grid-cols-12">
    <div class="col-span-12 md:col-span-6 lg:col-span-4">
        <!-- Responsive column -->
    </div>
</div>

/* Breakpoint values */
sm: 576px
md: 768px
lg: 992px
xl: 1200px
2xl: 1920px
```

### Styling Best Practices

1. **Use Tailwind utilities first** for spacing, colors, typography
2. **Use PrimeNG classes** for component-specific styling
3. **Create component SCSS** only for complex custom styles
4. **Follow BEM naming** for custom classes
5. **Use CSS variables** for theme-aware colors

---

## 10. API & Data Fetching

### Environment Configuration
```typescript
// src/app/Core/Environments/environment.ts
export const environment = {
    production: false,
    apis: {
        core: 'https://localhost:7187/rab/api',
        auth: 'https://localhost:7187'
    }
};
```

### Service Pattern
```typescript
@Injectable({ providedIn: 'root' })
export class FeatureService {
    private apiUrl = `${environment.apis.core}/Feature`;

    constructor(private http: HttpClient) {}

    // GET all
    getAll(): Observable<Feature[]> {
        return this.http.get<Feature[]>(`${this.apiUrl}/GetAll`);
    }

    // GET by ID
    getById(id: number): Observable<Feature> {
        return this.http.get<Feature>(`${this.apiUrl}/GetById/${id}`);
    }

    // POST create
    create(data: Feature): Observable<Feature> {
        return this.http.post<Feature>(`${this.apiUrl}/SaveAsyn`, data);
    }

    // PUT update
    update(id: number, data: Feature): Observable<Feature> {
        return this.http.put<Feature>(`${this.apiUrl}/Update/${id}`, data);
    }

    // DELETE
    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/Delete/${id}`);
    }
}
```

### API Endpoints Reference

| Service | Endpoint Pattern | Methods |
|---------|-----------------|---------|
| Authentication | `/Identity/*` | GetToken, RefreshToken |
| Employee | `/EmployeeInfo/*` | GetAll, GetById, Search, SaveAsyn, Update, Delete |
| Address | `/AddressInfo/*` | GetByEmployeeId, SaveAsyn, Update |
| Common Code | `/CommonCode/*` | GetByTypeAsyn, GetById, Create, Update, Delete |

### RxJS Operators Used

```typescript
// Parallel requests
forkJoin({
    employee: this.getEmployee(id),
    addresses: this.getAddresses(id)
}).subscribe(({ employee, addresses }) => {
    // Handle both responses
});

// Sequential requests
this.saveEmployee(emp).pipe(
    switchMap(savedEmp => this.saveAddress(savedEmp.id, address))
).subscribe();

// Transform response
this.http.get<ApiResponse>(url).pipe(
    map(response => response.data),
    tap(data => console.log('Received:', data)),
    catchError(this.handleError)
);

// Sequential array operations
from(items).pipe(
    concatMap(item => this.saveItem(item)),
    toArray()
).subscribe(results => {
    // All items saved
});
```

### Error Handling
```typescript
private handleError(error: HttpErrorResponse): Observable<never> {
    const message = error?.error?.message || error?.message || 'Unknown error';
    return throwError(() => new Error(message));
}
```

---

## 11. Authentication System

### Authentication Flow

```
1. User Login
   └── POST /Identity/GetToken
       └── Response: { token, refreshToken, userName, userId, roleId, roleName }
           └── Store in localStorage

2. Protected Request
   └── AuthInterceptor adds: Authorization: Bearer {token}
       └── If 401 response:
           └── Call refreshToken()
               └── Retry original request
                   └── If refresh fails: logout()

3. Route Access
   └── AuthGuard checks isLoggedIn()
       └── If false: redirect to /login
```

### AuthenticationService
```typescript
@Injectable({ providedIn: 'root' })
export class AuthenticationService {
    private apiUrl = environment.apis.auth;

    login(email: string, password: string): Observable<LoginResponse> {
        return this.http.post<LoginResponse>(`${this.apiUrl}/Identity/GetToken`,
            { email, password }
        ).pipe(
            tap(response => {
                localStorage.setItem('auth', JSON.stringify(response));
                localStorage.setItem('token', response.token);
                localStorage.setItem('refreshToken', response.refreshToken);
            })
        );
    }

    refreshToken(): Observable<LoginResponse> {
        const refreshToken = this.getRefreshToken();
        return this.http.post<LoginResponse>(`${this.apiUrl}/Identity/RefreshToken`,
            { refreshToken }
        ).pipe(
            tap(response => {
                localStorage.setItem('token', response.token);
                localStorage.setItem('refreshToken', response.refreshToken);
            })
        );
    }

    logout(): void {
        localStorage.clear();
    }

    isLoggedIn(): boolean {
        return !!localStorage.getItem('token');
    }

    getToken(): string | null {
        return localStorage.getItem('token');
    }

    getRefreshToken(): string | null {
        return localStorage.getItem('refreshToken');
    }
}
```

### HTTP Interceptor
```typescript
export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
    const authService = inject(AuthenticationService);
    const router = inject(Router);

    const token = authService.getToken();

    if (token) {
        req = req.clone({
            setHeaders: { Authorization: `Bearer ${token}` }
        });
    }

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
                return authService.refreshToken().pipe(
                    switchMap(response => {
                        req = req.clone({
                            setHeaders: { Authorization: `Bearer ${response.token}` }
                        });
                        return next(req);
                    }),
                    catchError(() => {
                        authService.logout();
                        router.navigate(['/login']);
                        return throwError(() => error);
                    })
                );
            }
            return throwError(() => error);
        })
    );
};
```

---

## 12. Form Handling Patterns

### Reactive Forms Setup
```typescript
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

@Component({
    imports: [ReactiveFormsModule, /* ... */]
})
export class MyComponent implements OnInit {
    form: FormGroup;

    constructor(private fb: FormBuilder) {}

    ngOnInit() {
        this.form = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(3)]],
            email: ['', [Validators.required, Validators.email]],
            age: [null, [Validators.required, Validators.min(18)]],
            status: [true]
        });
    }
}
```

### Form Template Pattern
```html
<form [formGroup]="form" (ngSubmit)="onSubmit()">
    <div class="field">
        <label for="name">Name</label>
        <input pInputText id="name" formControlName="name" />
        <small *ngIf="form.get('name')?.invalid && form.get('name')?.touched"
               class="p-error">
            Name is required
        </small>
    </div>

    <button pButton type="submit" [disabled]="form.invalid">Submit</button>
</form>
```

### Dynamic Validators
```typescript
handleRelieverToggle() {
    const isReliever = this.form.get('isReliever')?.value;
    const relieverField = this.form.get('relieverName');

    if (isReliever) {
        relieverField?.setValidators([Validators.required]);
    } else {
        relieverField?.clearValidators();
    }
    relieverField?.updateValueAndValidity();
}
```

### Checkbox-Controlled Field Disabling
```typescript
handleSameAsPermanent() {
    const sameAs = this.form.get('sameAsPermanent')?.value;
    const presentFields = ['presentAddress', 'presentCity', 'presentPostCode'];

    presentFields.forEach(field => {
        const control = this.form.get(field);
        if (sameAs) {
            control?.disable();
            control?.setValue(this.form.get(field.replace('present', 'permanent'))?.value);
        } else {
            control?.enable();
        }
    });
}
```

### Multi-Address Form Pattern
```typescript
// Building address payload
buildAddressPayload(): AddressInfoModel[] {
    const addresses: AddressInfoModel[] = [];

    // Permanent address
    addresses.push({
        locationType: 'PERMANENT',
        locationCode: this.form.get('permDivision')?.value,
        postCode: this.form.get('permPostCode')?.value,
        addressAreaEN: this.form.get('permAddressEN')?.value,
        addressAreaBN: this.form.get('permAddressBN')?.value
    });

    // Present address (if different)
    if (!this.form.get('sameAsPermanent')?.value) {
        addresses.push({
            locationType: 'PRESENT',
            // ... similar fields
        });
    }

    return addresses;
}
```

### Form Validation Error Collection
```typescript
getFormValidationErrors(): string[] {
    const errors: string[] = [];

    Object.keys(this.form.controls).forEach(key => {
        const control = this.form.get(key);
        if (control?.errors) {
            Object.keys(control.errors).forEach(errorKey => {
                errors.push(`${key}: ${errorKey}`);
            });
        }
    });

    return errors;
}
```

---

## 13. Type Definitions & Models

### Authentication Models
```typescript
interface Login {
    email: string;
    password: string;
}

interface LoginResponse {
    token: string;
    refreshToken: string;
    userName: string;
    validity: string;
    userId: string;
    emailId: string;
    roleId: string;
    roleName: string;
    expiredTime: string;
    id: string;
}
```

### Employee Models
```typescript
interface EmployeeInfoModel {
    EmployeeID: number;
    LastMotherUnit: number | null;
    MemberType: string;
    Appointment: string;
    JoiningDate: Date | string;
    Rank: number;
    Branch: number;
    Trade: number;
    TradeMark?: string;
    Gender: string;
    Prefix: string;
    ServiceId: string;
    RABID: string;
    NID?: string;
    FullNameEN: string;
    FullNameBN: string;
    IsReliever: boolean;
    PostingStatus: string;
    Status: boolean;
    CreatedBy?: string;
    CreatedDate?: Date | string;
    LastUpdatedBy?: string;
    Lastupdate?: Date | string;
    StatusDate?: Date | string;
}

interface AddressInfoModel {
    employeeID: number;
    addressId: number;
    fmid: number;
    locationType: LocationType;
    locationCode: string;
    postCode: string;
    addressAreaEN: string;
    addressAreaBN: string;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}

type LocationType = 'PERMANENT' | 'PRESENT' | 'WIFE_PERMANENT' | 'WIFE_PRESENT';

interface CompleteEmployeeProfile {
    employee: EmployeeInfoModel;
    addresses: AddressInfoModel[];
}
```

### Layout Models
```typescript
interface layoutConfig {
    preset?: string;
    primary?: string;
    surface?: string | undefined | null;
    darkTheme?: boolean;
    menuMode?: string;
}

interface LayoutState {
    staticMenuDesktopInactive?: boolean;
    overlayMenuActive?: boolean;
    configSidebarVisible?: boolean;
    staticMenuMobileActive?: boolean;
    menuHoverActive?: boolean;
}

interface MenuChangeEvent {
    key: string;
    routeEvent?: boolean;
}
```

### Master Setup Models
```typescript
interface CommonCode {
    orgId: number;
    codeId: number;
    codeType: string;
    codeValueEN: string;
    codeValueBN: string | null;
    commCode: string | null;
    displayCodeValueEN: string | null;
    displayCodeValueBN: string | null;
    status: boolean;
    parentCodeId: number | null;
    sortOrder: number | null;
    level: number | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}

interface MasterConfig {
    title: string;
    formFields: MasterFormField[];
    tableColumns: MasterTableColumn[];
}

interface MasterFormField {
    name: string;
    label: string;
    type: 'text' | 'select';
    options?: any[];
    required: boolean;
    default?: boolean;
}

interface MasterTableColumn {
    field: string;
    header: string;
}
```

### Dynamic Field Types
```typescript
type DynamicFieldType = 'text' | 'select' | 'date' | 'number' | 'textarea';
```

---

## 14. Custom Utilities & Helpers

### Date Utilities
```typescript
// Convert to API date format
toDateOnlyString(value: Date | string): string {
    if (!value) return '';
    const date = new Date(value);
    return date.toISOString().split('T')[0];
}
```

### ID Generation
```typescript
generateRabId(prefix: string, serviceId: string): string {
    return `${prefix}-${serviceId}`;
}
```

### Reusable Address Component
```typescript
// AddressSectionComponent usage
<app-address-section
    [formGroup]="employeeForm"
    [prefix]="'perm'"
    [title]="'Permanent Address'">
</app-address-section>

// Component handles fields with prefix:
// permDivision, permDistrict, permUpazila, permPostCode, etc.
```

### Dynamic Field Component
```typescript
// DynamicFieldComponent usage
<app-dynamic-field
    [label]="'Employee Name'"
    [type]="'text'"
    [formControlName]="'employeeName'"
    [required]="true">
</app-dynamic-field>

// Supports: text, select, date, number, textarea
```

### Form Parent Access in Child Components
```typescript
// In child component
@Component({
    viewProviders: [
        { provide: ControlContainer, useExisting: FormGroupDirective }
    ]
})
export class ChildComponent {
    // Can now access parent form
}
```

---

## 15. Testing Setup

### Test Configuration
- **Framework**: Jasmine 5.8.0
- **Runner**: Karma 6.4.4
- **Browser**: Chrome (headless available)

### Running Tests
```bash
npm run test          # Run tests with Karma
ng test              # Same as above
ng test --watch      # Watch mode
ng test --code-coverage  # With coverage report
```

### Test File Pattern
```typescript
// feature.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeatureComponent } from './feature.component';

describe('FeatureComponent', () => {
    let component: FeatureComponent;
    let fixture: ComponentFixture<FeatureComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FeatureComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(FeatureComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
```

---

## 16. Code Quality Standards

### ESLint Rules
- Angular-specific rules enabled
- TypeScript strict rules
- No console.log blocking (allowed)
- Component selector prefix: `app-`

### Prettier Configuration
```json
{
    "tabWidth": 4,
    "printWidth": 250,
    "singleQuote": true,
    "trailingComma": "none",
    "bracketSameLine": false
}
```

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `EmployeeInfoComponent` |
| Services | PascalCase + Service | `EmployeeService` |
| Models/Interfaces | PascalCase | `EmployeeInfoModel` |
| Files | kebab-case | `employee-info.component.ts` |
| Variables | camelCase | `employeeList` |
| Constants | UPPER_SNAKE | `API_BASE_URL` |
| CSS Classes | kebab-case | `employee-card` |

### File Organization
```typescript
// Standard component file order
1. Imports (grouped: Angular, Third-party, Local)
2. @Component decorator
3. Class definition
   - Properties (inputs, outputs, public, private)
   - Constructor
   - Lifecycle hooks (ngOnInit, ngOnDestroy, etc.)
   - Public methods
   - Private methods
```

---

## 17. Design Guidelines

### UI Component Usage (PrimeNG)

| Use Case | PrimeNG Component |
|----------|-------------------|
| Tables | `p-table` with sorting, filtering, pagination |
| Forms | `pInputText`, `p-dropdown`, `p-calendar` |
| Buttons | `pButton`, `p-splitButton` |
| Dialogs | `p-dialog` |
| Messages | `p-toast`, `p-messages` |
| Cards | `p-card` |
| Tabs | `p-tabView` |
| Menus | `p-menu`, `p-menubar` |

### Layout Patterns

```html
<!-- Standard Page Layout -->
<div class="grid grid-cols-12 gap-4">
    <!-- Full width header -->
    <div class="col-span-12">
        <p-card>
            <h2>Page Title</h2>
        </p-card>
    </div>

    <!-- Content area -->
    <div class="col-span-12 lg:col-span-8">
        <!-- Main content -->
    </div>

    <!-- Sidebar -->
    <div class="col-span-12 lg:col-span-4">
        <!-- Side content -->
    </div>
</div>
```

### Form Layout Pattern
```html
<form [formGroup]="form" class="grid grid-cols-12 gap-4">
    <div class="col-span-12 md:col-span-6">
        <div class="field">
            <label>Field 1</label>
            <input pInputText formControlName="field1" class="w-full" />
        </div>
    </div>
    <div class="col-span-12 md:col-span-6">
        <div class="field">
            <label>Field 2</label>
            <input pInputText formControlName="field2" class="w-full" />
        </div>
    </div>
</form>
```

### Theme Consistency
- Use `surface` variables for backgrounds
- Use `primary` for action colors
- Use `text-color` for typography
- Maintain dark mode compatibility

---

## 18. Development Workflow

### Common Commands
```bash
# Development
npm start             # Start dev server (ng serve)
npm run build         # Production build
npm run test          # Run tests
npm run lint          # Run ESLint

# Angular CLI
ng generate component Components/Features/NewFeature/new-feature
ng generate service Core/Services/new-service
ng generate guard Core/Guard/new-guard
```

### Creating New Feature Checklist

1. **Create Component Structure**
   ```
   Components/Features/NewFeature/
   ├── new-feature.component.ts
   ├── new-feature.component.html
   ├── new-feature.component.scss
   └── new-feature.service.ts (if needed)
   ```

2. **Define Models** (in `Models/` directory)

3. **Create Service** (if API integration needed)

4. **Add Route** (in `app.routes.ts`)

5. **Add Menu Item** (in `app.menu.ts`)

6. **Write Tests** (`.spec.ts` files)

### Before Starting Development

Always check:
- [ ] Read this guide thoroughly
- [ ] Understand existing patterns
- [ ] Check for reusable components
- [ ] Follow naming conventions
- [ ] Use existing services if available
- [ ] Match styling patterns
- [ ] Consider dark mode support
- [ ] Plan responsive behavior

---

## Quick Reference Card

### Import Patterns
```typescript
// PrimeNG Modules
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { CalendarModule } from 'primeng/calendar';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';

// Angular Common
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// RxJS
import { Observable, forkJoin, switchMap, catchError, tap, map } from 'rxjs';
```

### Service Injection
```typescript
// Modern inject() function
private service = inject(MyService);

// or Constructor injection
constructor(private service: MyService) {}
```

### Common Tailwind Classes
```html
<!-- Spacing -->
p-4, m-4, gap-4, space-y-4

<!-- Grid -->
grid, grid-cols-12, col-span-6, md:col-span-4

<!-- Flexbox -->
flex, items-center, justify-between

<!-- Typography -->
text-lg, font-semibold, text-primary

<!-- Width -->
w-full, w-1/2, max-w-lg
```

---

**Last Updated**: January 2026

**Version**: 1.0.0

---

> **Remember**: This guide is your reference for all frontend development. Consult it before making architectural decisions or implementing new features.
