import PageHeader from '../../components/PageHeader.jsx';
import BulkRegister from './BulkRegister.jsx';
import '../../styles/shared/StudentRegister.css';

export default function StudentManager({ me, onNavigate }) {
  const scope = me?.role === 'program_chair' ? 'program' : 'department';
  return (
    <main className="sm-page page-shell">
      <PageHeader
        title="Student Registration"
        subtitle={`Bulk register students and alumni for your ${scope}.`}
      />

      <div className="sm-content">
        <BulkRegister user={me} />
      </div>
    </main>
  );
}
