# TanStack Start Best Practices

Dit document beschrijft de aanbevolen best practices voor TanStack Start (TanStack Router) ontwikkeling, inclusief routing, SSR, en data loading.

## Inhoudsopgave

- [Project Setup](#project-setup)
- [Routing](#routing)
- [Data Loading](#data-loading)
- [Server-Side Rendering (SSR)](#server-side-rendering-ssr)
- [Authenticatie](#authenticatie)
- [Performance Optimalisatie](#performance-optimalisatie)

---

## Project Setup

### Basis Configuratie

```typescript
// app/router.tsx
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  context: {
    // Inject dependencies hier
    queryClient: undefined!,
    auth: undefined!,
  },
});

// Type-safe router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

### Route Context met Dependency Injection

```typescript
// app/routes/__root.tsx
import { createRootRouteWithContext } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { AuthContext } from '@/services/auth';

interface RouterContext {
  queryClient: QueryClient;
  auth: AuthContext;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
```

---

## Routing

### File-Based Routing Structuur

```
app/routes/
├── __root.tsx              # Root layout
├── index.tsx               # / route
├── about.tsx               # /about route
├── posts/
│   ├── index.tsx           # /posts route
│   ├── $postId.tsx         # /posts/:postId route
│   └── $postId.edit.tsx    # /posts/:postId/edit route
├── _authenticated/         # Layout route (geen URL segment)
│   ├── dashboard.tsx       # /dashboard (protected)
│   └── settings.tsx        # /settings (protected)
└── api/
    └── [...path].tsx       # Catch-all API route
```

### Route Definities

```typescript
// app/routes/posts/$postId.tsx
import { createFileRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';

// Search params validatie
const postSearchSchema = z.object({
  tab: z.enum(['content', 'comments', 'analytics']).optional().default('content'),
  page: z.number().optional().default(1),
});

export const Route = createFileRoute('/posts/$postId')({
  // Valideer en parse search params
  validateSearch: postSearchSchema,

  // Dependencies voor caching
  loaderDeps: ({ search: { tab, page } }) => ({ tab, page }),

  // Data loading
  loader: async ({ params, deps, context }) => {
    const post = await context.queryClient.ensureQueryData({
      queryKey: ['posts', params.postId],
      queryFn: () => fetchPost(params.postId),
    });

    if (!post) {
      throw notFound();
    }

    // Laad extra data op basis van tab
    if (deps.tab === 'comments') {
      await context.queryClient.ensureQueryData({
        queryKey: ['posts', params.postId, 'comments', deps.page],
        queryFn: () => fetchComments(params.postId, deps.page),
      });
    }

    return { post };
  },

  // Error handling
  errorComponent: PostErrorBoundary,
  notFoundComponent: PostNotFound,
  pendingComponent: PostSkeleton,

  component: PostPage,
});
```

### Navigatie

```typescript
import { Link, useNavigate, useRouter } from '@tanstack/react-router';

function Navigation() {
  const navigate = useNavigate();
  const router = useRouter();

  return (
    <nav>
      {/* Type-safe Link */}
      <Link
        to="/posts/$postId"
        params={{ postId: '123' }}
        search={{ tab: 'comments' }}
        activeProps={{ className: 'active' }}
      >
        View Post
      </Link>

      {/* Programmatische navigatie */}
      <button onClick={() => navigate({ to: '/dashboard' })}>
        Dashboard
      </button>

      {/* Met search params update */}
      <button
        onClick={() =>
          navigate({
            search: (prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }),
          })
        }
      >
        Next Page
      </button>

      {/* Invalidate en refresh */}
      <button onClick={() => router.invalidate()}>
        Refresh Data
      </button>
    </nav>
  );
}
```

---

## Data Loading

### Loader Patterns

```typescript
// Basis loader
export const Route = createFileRoute('/users')({
  loader: async () => {
    const users = await fetchUsers();
    return { users };
  },
});

// Met context (TanStack Query integratie)
export const Route = createFileRoute('/users')({
  loader: async ({ context: { queryClient } }) => {
    // ensureQueryData haalt data op OF gebruikt cache
    const users = await queryClient.ensureQueryData({
      queryKey: ['users'],
      queryFn: fetchUsers,
      staleTime: 5 * 60 * 1000, // 5 minuten vers
    });
    return { users };
  },
});

// Parallelle data loading
export const Route = createFileRoute('/dashboard')({
  loader: async ({ context: { queryClient } }) => {
    const [users, stats, notifications] = await Promise.all([
      queryClient.ensureQueryData({
        queryKey: ['users'],
        queryFn: fetchUsers,
      }),
      queryClient.ensureQueryData({
        queryKey: ['stats'],
        queryFn: fetchStats,
      }),
      queryClient.ensureQueryData({
        queryKey: ['notifications'],
        queryFn: fetchNotifications,
      }),
    ]);

    return { users, stats, notifications };
  },
});
```

### Loader Data Consumeren

```typescript
function PostPage() {
  // Type-safe loader data
  const { post } = Route.useLoaderData();

  // Of via getRouteApi voor externe componenten
  const routeApi = getRouteApi('/posts/$postId');
  const loaderData = routeApi.useLoaderData();

  // Search params
  const { tab, page } = Route.useSearch();

  // Route params
  const { postId } = Route.useParams();

  return (
    <article>
      <h1>{post.title}</h1>
      <Tabs value={tab}>
        <TabContent value="content">{post.content}</TabContent>
        <TabContent value="comments">
          <Comments postId={postId} page={page} />
        </TabContent>
      </Tabs>
    </article>
  );
}
```

### Stale-While-Revalidate Caching

```typescript
export const Route = createFileRoute('/products')({
  // Configureer caching gedrag
  staleTime: 30_000, // Data is 30 seconden vers
  gcTime: 5 * 60_000, // Garbage collect na 5 minuten

  // Dependencies die cache key beïnvloeden
  loaderDeps: ({ search: { category, sort } }) => ({ category, sort }),

  loader: async ({ deps }) => {
    // Cache key = route path + loaderDeps
    return fetchProducts(deps);
  },
});
```

### Preloading

```typescript
// Automatisch preloaden op hover/focus
<Link to="/posts/$postId" params={{ postId: '123' }} preload="intent">
  View Post
</Link>

// Handmatig preloaden
function ProductCard({ product }: { product: Product }) {
  const router = useRouter();

  const handleMouseEnter = () => {
    router.preloadRoute({
      to: '/products/$productId',
      params: { productId: product.id },
    });
  };

  return (
    <div onMouseEnter={handleMouseEnter}>
      <Link to="/products/$productId" params={{ productId: product.id }}>
        {product.name}
      </Link>
    </div>
  );
}
```

---

## Server-Side Rendering (SSR)

### SSR Modes

TanStack Start ondersteunt drie SSR modes per route:

```typescript
// Mode 1: Full SSR (default)
// beforeLoad + loader draaien op server, component rendered op server
export const Route = createFileRoute('/blog')({
  ssr: true, // of gewoon weglaten
  loader: async () => fetchBlogPosts(),
});

// Mode 2: Data-only SSR
// Loaders draaien op server, component rendered alleen op client
// Goed voor: snelle data fetch, maar browser-only UI
export const Route = createFileRoute('/canvas-editor')({
  ssr: 'data-only',
  loader: async () => fetchEditorData(),
});

// Mode 3: No SSR
// Alles draait alleen op client
// Goed voor: localStorage, browser APIs, etc.
export const Route = createFileRoute('/local-settings')({
  ssr: false,
  loader: async () => {
    // Deze code draait alleen in de browser
    const settings = localStorage.getItem('settings');
    return { settings: JSON.parse(settings ?? '{}') };
  },
});
```

### Hydration Best Practices

```typescript
// Vermijd hydration mismatches
export const Route = createFileRoute('/time-sensitive')({
  // Gebruik ssr: 'data-only' voor time-sensitive content
  ssr: 'data-only',

  loader: async () => ({
    serverTime: new Date().toISOString(),
  }),
});

function TimeSensitivePage() {
  const { serverTime } = Route.useLoaderData();
  const [clientTime, setClientTime] = useState<string>();

  useEffect(() => {
    setClientTime(new Date().toISOString());
  }, []);

  return (
    <div>
      <p>Server time: {serverTime}</p>
      <p>Client time: {clientTime ?? 'Loading...'}</p>
    </div>
  );
}
```

### Server Functions

```typescript
// app/routes/api/users.ts
import { createServerFn } from '@tanstack/start';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

export const createUser = createServerFn('POST', async (input: unknown) => {
  // Server-side validatie
  const data = createUserSchema.parse(input);

  // Database operatie
  const user = await db.user.create({ data });

  return user;
});

// Gebruik in component
function CreateUserForm() {
  const handleSubmit = async (formData: FormData) => {
    const result = await createUser({
      name: formData.get('name') as string,
      email: formData.get('email') as string,
    });

    // Handle result
  };

  return <form action={handleSubmit}>...</form>;
}
```

---

## Authenticatie

### Protected Routes met beforeLoad

```typescript
// app/routes/_authenticated.tsx (layout route)
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    // Check auth state
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      });
    }

    // Return user data voor child routes
    return {
      user: context.auth.user,
    };
  },

  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="authenticated-layout">
      <Sidebar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

### Role-Based Access Control

```typescript
// app/routes/_authenticated/admin.tsx
export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: async ({ context }) => {
    // Parent route heeft al auth gecheckt
    const { user } = context;

    if (user.role !== 'admin') {
      throw redirect({
        to: '/dashboard',
      });
    }
  },

  loader: async ({ context }) => {
    return fetchAdminData();
  },
});
```

### Auth Context Setup

```typescript
// app/services/auth.ts
import { createServerFn } from '@tanstack/start';
import { getCookie } from 'vinxi/http';

export const getSession = createServerFn('GET', async () => {
  const sessionToken = getCookie('session');

  if (!sessionToken) {
    return null;
  }

  const session = await db.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return {
    user: session.user,
    isAuthenticated: true,
  };
});

// In router setup
export const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // Wordt ingevuld door provider
    queryClient: undefined!,
  },
});

// App component
function App() {
  const auth = useAuth(); // Custom hook
  const queryClient = useQueryClient();

  return (
    <RouterProvider
      router={router}
      context={{ auth, queryClient }}
    />
  );
}
```

---

## Performance Optimalisatie

### Pending States

```typescript
export const Route = createFileRoute('/slow-page')({
  // Toon loading state na 1 seconde
  pendingMs: 1000,

  // Blijf minimaal 500ms in loading state (voorkom flicker)
  pendingMinMs: 500,

  pendingComponent: () => <LoadingSkeleton />,

  loader: async () => {
    // Langzame operatie
    return fetchSlowData();
  },
});
```

### Error Handling

```typescript
export const Route = createFileRoute('/error-prone')({
  loader: async () => {
    try {
      return await fetchData();
    } catch (error) {
      // Specifieke error handling
      if (error instanceof NotFoundError) {
        throw notFound();
      }
      throw error;
    }
  },

  // Custom error component
  errorComponent: ({ error, reset }) => (
    <div className="error">
      <h2>Er ging iets mis</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Probeer opnieuw</button>
    </div>
  ),

  // 404 component
  notFoundComponent: () => (
    <div className="not-found">
      <h2>Niet gevonden</h2>
      <Link to="/">Terug naar home</Link>
    </div>
  ),

  // Error callback
  onError: (error) => {
    // Log naar monitoring service
    Sentry.captureException(error);
  },
});
```

### Route Prefetching Strategy

```typescript
// Global prefetch configuratie
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent', // Preload op hover/focus
  defaultPreloadStaleTime: 30_000, // Preloaded data blijft 30s vers
});

// Per-route override
export const Route = createFileRoute('/heavy-page')({
  preload: false, // Disable preloading voor zware pagina's
});

// Conditionele preloading
<Link
  to="/posts/$postId"
  params={{ postId }}
  preload={isHighPriorityLink ? 'intent' : false}
>
  View Post
</Link>
```

---

## Bronnen

- [TanStack Router Data Loading](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading)
- [Selective Server-Side Rendering](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr)
- [Effective rendering with Selective SSR](https://blog.logrocket.com/selective-ssr-tanstack-start/)
- [Authentication and Protected Routes](https://deepwiki.com/tanstack/router/9.4-authentication-and-protected-routes)
