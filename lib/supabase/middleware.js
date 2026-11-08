import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { homeForRole } from '@/lib/roles'

// Supabase stores chunked auth cookies like `sb-xxxx-auth-token.0`.
function isAuthCookie(name) {
  return name.startsWith('sb-') && name.includes('-auth-token')
}

function clearAuthCookies(request, response) {
  request.cookies.getAll().forEach(({ name }) => {
    if (!isAuthCookie(name)) return
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    })
  })
  return response
}

function redirectTo(request, target) {
  if (request.nextUrl.pathname === target) {
    return NextResponse.next({ request })
  }
  return NextResponse.redirect(new URL(target, request.url))
}

export async function updateSession(request) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  let authUnavailable = false
  try {
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      // A deleted/restored auth user leaves a dead refresh token in the
      // browser. Clear it instead of retrying it on every request.
      if (error.code === 'refresh_token_not_found' || error.code === 'session_not_found') {
        const login = NextResponse.redirect(new URL('/login', request.url))
        return clearAuthCookies(request, login)
      }

      // No session at all is the normal logged-out case. auth-js reports it
      // as `AuthSessionMissingError` (no `code`), so treat it as "not signed
      // in" and let the redirect checks below send the user to /login.
      const sessionMissing =
        error.name === 'AuthSessionMissingError' || error.code === 'session_missing'

      // Anything else is usually a VPN/network hiccup. Do not bounce the
      // user around — let the page's own role guard decide what to render.
      if (!sessionMissing) authUnavailable = true
    } else {
      user = data?.user ?? null
    }
  } catch {
    // Network switched mid-request. Let the request through so the user does
    // not land on a redirect loop or a "page not found" screen.
    authUnavailable = true
  }

  if (authUnavailable) return response

  const path = request.nextUrl.pathname

  let role = null
  if (user) {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      // A transient profile-query failure (offline/VPN change) must not log
      // the user out or cause redirect loops.
      if (profileError) return response

      role = profile?.role ?? null

      // Authenticated but no profile row: the account is incomplete. Clear
      // the session so the user can sign in again after it is created.
      if (!role) {
        const login = NextResponse.redirect(new URL('/login', request.url))
        return clearAuthCookies(request, login)
      }
    } catch {
      return response
    }
  }

  if (!user && path !== '/login' && path !== '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && path === '/login') {
    return redirectTo(request, homeForRole(role))
  }

  if (path.startsWith('/admin') && role !== 'admin') {
    return redirectTo(request, homeForRole(role))
  }

  if (path.startsWith('/supervisor') && role !== 'supervisor' && role !== 'admin') {
    return redirectTo(request, homeForRole(role))
  }

  if (path.startsWith('/user') && role !== 'user' && role !== 'admin') {
    return redirectTo(request, homeForRole(role))
  }

  return response
}
