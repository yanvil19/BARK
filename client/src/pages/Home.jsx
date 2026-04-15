export default function Home({ me }) {
  if (!me) {
    return (
      <main>
        <h1>Welcome - Landing Page</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  if (me.role === 'super_admin') {
    return (
      <main>
        <h1>Dashboard for Super Admin</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  if (me.role === 'dean') {
    return (
      <main>
        <h1>Dashboard for Dean</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  if (me.role === 'program_chair') {
    return (
      <main>
        <h1>Dashboard for Program Chair</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  if (me.role === 'professor') {
    return (
      <main>
        <h1>Dashboard for Professor</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  if (me.role === 'student') {
    return (
      <main>
        <h1>Dashboard for Student</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Welcome</h1>
      <p>Insert content here</p>
    </main>
  );
}
