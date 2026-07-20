import PageHeader from '../../components/PageHeader.jsx';
import BulkRegister from '../shared/BulkRegister.jsx';
import '../../styles/dean/DeanStudentRegister.css';

export default function StudentManager({ me, onNavigate }) {
  return (
    <main className="sm-page">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Student Registration"
        subtitle="Bulk register students and alumni for your department."
      />

      <div className="sm-content">
        <BulkRegister user={me} />
      </div>
    </main>
  );
}
