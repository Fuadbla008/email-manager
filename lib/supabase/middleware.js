import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { homeForRole } from '@/lib/roles'

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

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  let role = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    role = profile?.role ?? null
  }

  if (!user && path !== '/login' && path !== '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && path === '/login') {
    return NextResponse.redirect(new URL(homeForRole(role), request.url))
  }

  if (path.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL(homeForRole(role), request.url))
  }

  if (path.startsWith('/supervisor') && role !== 'supervisor' && role !== 'admin') {
    return NextResponse.redirect(new URL(homeForRole(role), request.url))
  }

  if (path.startsWith('/user') && role !== 'user' && role !== 'admin') {
    return NextResponse.redirect(new URL(homeForRole(role), request.url))
  }

  return response
}