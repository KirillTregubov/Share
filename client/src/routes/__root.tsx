import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav className="flex gap-2 p-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>
      </nav>
      <Outlet />
      {/* <ReactQueryDevtools /> */}
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </>
  )
})
