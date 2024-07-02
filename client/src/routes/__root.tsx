import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  Link,
  Outlet
} from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: () => (
    <div className="relative flex h-screen w-full flex-col items-center justify-center">
      <nav className="flex gap-2 p-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>
      </nav>
      <Outlet />
      {/* <ReactQueryDevtools /> */}
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </div>
  )
})
