import { useEffect, useState } from 'react'
import { ReactQueryDevtools } from 'react-query/devtools'
import Router from 'next/router'
import '../styles/global.css'
import { QueryClient, QueryClientProvider } from 'react-query'
import Layout from '../components/layout'
import countly from '../lib/countly'
import { FilesContext } from '../lib/upload'


const queryClient = new QueryClient({
  defaultOptions: { 
    queries: { 
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000
    }
  },
})

/**
 * App Component
 *
 * @param {any} props
 */
export default function App({ Component, pageProps }) {
  useEffect(() => {
    countly.init()
    Router.events.on('routeChangeComplete', (route) => {
      countly.trackPageView(route)
    })
  }, [])

  const [files, setFiles] = useState([])
  
  return (
    <QueryClientProvider client={queryClient}>
      <FilesContext.Provider value={{
        files, 
        // @ts-ignore
        set: setFiles
      }}>
        <Layout {...pageProps}>
          {(props) => <Component {...pageProps} {...props} />}
        </Layout>
      </FilesContext.Provider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
