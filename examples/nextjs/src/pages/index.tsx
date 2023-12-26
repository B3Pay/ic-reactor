import Head from "next/head"

import styles from "styles/Home.module.css"

import AddTodo from "components/AddTodo"
import Login from "components/Login"
import Todos from "components/Todos"
import Image from "next/image"
import { useActorStore, useAuthStore } from "service/todo"

function HomePage() {
  const { error } = useAuthStore()
  const { initialized } = useActorStore()

  return (
    <div className={styles.container}>
      <Head>
        <title>Internet Computer</title>
      </Head>
      <main className={styles.main}>
        <h3 className={styles.title}>
          Welcome to the Internet Computer starter template
        </h3>
        <Login />
        {error ? <div>Error: {JSON.stringify(error)}</div> : null}
        {initialized && (
          <div>
            <Todos />
            <AddTodo />
          </div>
        )}
      </main>
      <footer className={styles.footer}>
        <a
          href="https://internetcomputer.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            width={140}
            height={30}
            src="/icp-logo.svg"
            alt="DFINITY logo"
            className={styles.logo}
          />
        </a>
      </footer>
    </div>
  )
}

export default HomePage
