export default function UserAccount({ me }) {
  if (!me) {
    return (
      <main>
        <p>Not logged in</p>
      </main>
    );
  }

  return (
    <main>
      <h2>User Account</h2>
      <section>
        <h3>Account Information</h3>
        <div>
          <strong>Name:</strong> {me.name}
        </div>
        <div>
          <strong>Email:</strong> {me.email}
        </div>
        <div>
          <strong>Role:</strong> {me.role}
        </div>

        {me.studentId ? (
          <div>
            <strong>Student ID:</strong> {me.studentId}
          </div>
        ) : null}

        {me.alumniId ? (
          <div>
            <strong>Alumni ID:</strong> {me.alumniId}
          </div>
        ) : null}

        {me.department ? (
          <div>
            <strong>Department:</strong>{' '}
            {me.department.code ? `${me.department.code} - ${me.department.name}` : me.department.name || me.department}
          </div>
        ) : null}

        {me.program ? (
          <div>
            <strong>Program:</strong>{' '}
            {me.program.code ? `${me.program.code} - ${me.program.name}` : me.program.name || me.program}
          </div>
        ) : null}
      </section>
    </main>
  );
}
