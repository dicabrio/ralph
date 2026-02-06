# React Best Practices 2025

Dit document beschrijft de aanbevolen best practices voor React ontwikkeling in 2025, inclusief hooks, state management, en performance optimalisatie.

## Inhoudsopgave

- [Performance Optimalisatie](#performance-optimalisatie)
- [State Management](#state-management)
- [Hooks Best Practices](#hooks-best-practices)
- [Component Design](#component-design)
- [Code Organisatie](#code-organisatie)

---

## Performance Optimalisatie

### React Compiler

De React Compiler (React 19+) levert automatische optimalisaties:

- **30-60%** reductie in onnodige re-renders
- **20-40%** verbetering in interaction latency
- Apps zonder handmatige memoization zien **50-80%** verbetering

```tsx
// React Compiler optimaliseert automatisch - geen handmatige memo's nodig
function ProductList({ products }: { products: Product[] }) {
  const sortedProducts = products.sort((a, b) => a.price - b.price);

  return (
    <ul>
      {sortedProducts.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </ul>
  );
}
```

### Performance Targets

Streef naar deze Lighthouse scores:

| Metric | Target |
|--------|--------|
| Performance Score | 90+ |
| Accessibility | 100 |
| First Contentful Paint | < 1.8s |
| Largest Contentful Paint | < 2.5s |
| Cumulative Layout Shift | < 0.1 |
| First Input Delay | < 100ms |

### Code Splitting

```tsx
import { lazy, Suspense } from 'react';

// Lazy load zware componenten
const Dashboard = lazy(() => import('./Dashboard'));
const Analytics = lazy(() => import('./Analytics'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
}
```

### Image Optimalisatie

```tsx
// Gebruik next/image of een vergelijkbare library
import Image from 'next/image';

function ProductImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={400}
      height={300}
      loading="lazy"
      placeholder="blur"
      blurDataURL={generateBlurHash(src)}
    />
  );
}
```

---

## State Management

### Beslisboom

```
Is de state lokaal voor één component?
├── Ja → useState of useReducer
└── Nee → Moet state gedeeld worden?
    ├── Weinig updates, statische data → Context API
    └── Frequente updates, complexe state?
        ├── Server state (API data) → TanStack Query
        ├── URL state → nuqs library
        └── Client state → Zustand (aanbevolen)
```

### useState vs useReducer

```tsx
// useState - voor simpele, component-scoped values
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// useReducer - voor complexere state logica
interface FormState {
  values: Record<string, string>;
  errors: Record<string, string>;
  isSubmitting: boolean;
}

type FormAction =
  | { type: 'SET_FIELD'; field: string; value: string }
  | { type: 'SET_ERROR'; field: string; error: string }
  | { type: 'SUBMIT' }
  | { type: 'RESET' };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: '' },
      };
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.field]: action.error },
      };
    case 'SUBMIT':
      return { ...state, isSubmitting: true };
    case 'RESET':
      return { values: {}, errors: {}, isSubmitting: false };
    default:
      return state;
  }
}

function Form() {
  const [state, dispatch] = useReducer(formReducer, {
    values: {},
    errors: {},
    isSubmitting: false,
  });
  // ...
}
```

### Zustand (Aanbevolen voor Global State)

```tsx
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface CartStore {
  items: CartItem[];
  total: number;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartStore>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],
        total: 0,

        addItem: (item) => set((state) => {
          const existingItem = state.items.find(i => i.id === item.id);
          if (existingItem) {
            return {
              items: state.items.map(i =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
              total: state.total + item.price,
            };
          }
          return {
            items: [...state.items, { ...item, quantity: 1 }],
            total: state.total + item.price,
          };
        }),

        removeItem: (id) => set((state) => {
          const item = state.items.find(i => i.id === id);
          return {
            items: state.items.filter(i => i.id !== id),
            total: state.total - (item ? item.price * item.quantity : 0),
          };
        }),

        clearCart: () => set({ items: [], total: 0 }),
      }),
      { name: 'cart-storage' }
    )
  )
);

// Gebruik in componenten - selectieve subscriptions
function CartCount() {
  const itemCount = useCartStore((state) => state.items.length);
  return <span>{itemCount}</span>;
}
```

### TanStack Query voor Server State

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Query keys als constanten
const queryKeys = {
  users: ['users'] as const,
  user: (id: string) => ['users', id] as const,
  userPosts: (id: string) => ['users', id, 'posts'] as const,
};

// Fetch met query
function useUser(userId: string) {
  return useQuery({
    queryKey: queryKeys.user(userId),
    queryFn: () => fetchUser(userId),
    staleTime: 5 * 60 * 1000, // 5 minuten
    gcTime: 30 * 60 * 1000, // 30 minuten (was cacheTime)
  });
}

// Mutation met optimistic update
function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUser,
    onMutate: async (newUser) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user(newUser.id) });
      const previousUser = queryClient.getQueryData(queryKeys.user(newUser.id));

      queryClient.setQueryData(queryKeys.user(newUser.id), newUser);

      return { previousUser };
    },
    onError: (err, newUser, context) => {
      queryClient.setQueryData(
        queryKeys.user(newUser.id),
        context?.previousUser
      );
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user(variables.id) });
    },
  });
}
```

### Context API - Alleen voor Statische Data

```tsx
// Goed: Theme context (verandert zelden)
const ThemeContext = createContext<Theme>('light');

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  // Memoize de value om onnodige re-renders te voorkomen
  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// Slecht: Shopping cart in context (frequente updates)
// Gebruik hiervoor Zustand of Redux
```

---

## Hooks Best Practices

### Custom Hooks Extractie

```tsx
// Extraheer herbruikbare logica naar custom hooks
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}
```

### useEffect Best Practices

```tsx
// Vermijd: Alles in één useEffect
useEffect(() => {
  fetchUser();
  setupWebSocket();
  trackPageView();
}, []);

// Beter: Gescheiden effects met duidelijke verantwoordelijkheid
useEffect(() => {
  fetchUser();
}, [userId]);

useEffect(() => {
  const ws = setupWebSocket();
  return () => ws.close();
}, []);

useEffect(() => {
  trackPageView(pathname);
}, [pathname]);
```

### useCallback en useMemo

```tsx
// Gebruik useCallback voor functies die als props worden doorgegeven
function ParentComponent() {
  const [items, setItems] = useState<Item[]>([]);

  // Stabiele referentie voor child component
  const handleDelete = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  return <ItemList items={items} onDelete={handleDelete} />;
}

// Gebruik useMemo voor dure berekeningen
function DataTable({ data, sortKey }: { data: Row[]; sortKey: string }) {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) =>
      String(a[sortKey]).localeCompare(String(b[sortKey]))
    );
  }, [data, sortKey]);

  return (
    <table>
      {sortedData.map(row => <TableRow key={row.id} data={row} />)}
    </table>
  );
}
```

---

## Component Design

### Composition Pattern

```tsx
// Gebruik composition over configuration
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

function Card({ children, className }: CardProps) {
  return <div className={cn('card', className)}>{children}</div>;
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="card-header">{children}</div>;
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>;
}

function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="card-footer">{children}</div>;
}

// Compound component pattern
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

// Gebruik
<Card>
  <Card.Header>Titel</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Acties</Card.Footer>
</Card>
```

### Render Props & Children as Function

```tsx
interface DataFetcherProps<T> {
  url: string;
  children: (data: T | null, loading: boolean, error: Error | null) => React.ReactNode;
}

function DataFetcher<T>({ url, children }: DataFetcherProps<T>) {
  const { data, isLoading, error } = useQuery({
    queryKey: [url],
    queryFn: () => fetch(url).then(res => res.json()),
  });

  return <>{children(data, isLoading, error)}</>;
}

// Gebruik
<DataFetcher<User[]> url="/api/users">
  {(users, loading, error) => {
    if (loading) return <Spinner />;
    if (error) return <Error message={error.message} />;
    return <UserList users={users ?? []} />;
  }}
</DataFetcher>
```

---

## Code Organisatie

### Folder Structuur

```
src/
├── components/
│   ├── ui/                    # Herbruikbare UI componenten
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.test.tsx
│   │   │   └── index.ts
│   │   └── Card/
│   ├── features/              # Feature-specifieke componenten
│   │   ├── auth/
│   │   └── dashboard/
│   └── layout/                # Layout componenten
├── hooks/                     # Custom hooks
├── stores/                    # Zustand stores
├── services/                  # API services
├── utils/                     # Utility functies
├── types/                     # TypeScript types
└── constants/                 # Constanten en configuratie
```

### Barrel Exports

```tsx
// components/ui/index.ts
export { Button } from './Button';
export { Card } from './Card';
export { Input } from './Input';

// Gebruik
import { Button, Card, Input } from '@/components/ui';
```

---

## Bronnen

- [React Performance Optimization: 15 Best Practices for 2025](https://dev.to/alex_bobes/react-performance-optimization-15-best-practices-for-2025-17l9)
- [React State Management in 2025: What You Actually Need](https://www.developerway.com/posts/react-state-management-2025)
- [Modern React State Management in 2025](https://dev.to/joodi/modern-react-state-management-in-2025-a-practical-guide-2j8f)
- [State Management Trends in React 2025](https://makersden.io/blog/react-state-management-in-2025)
