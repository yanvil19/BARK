import '../styles/ProfileModal.css';

export default function ProfileModal({ me, onLogout }) {
  return (
    <div className="profile-modal">
      <div className="profile-modal-header">
        <h3>My Account</h3>
      </div>

      <div className="profile-modal-identifiers">
        <p className='userName'>{me.name || 'N/A'}</p>
        <p className='role'>{me.role || 'N/A'}</p>
      </div>
      <p className='email'>
        <svg
            className="email-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="currentColor"
          >
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
        {me.email || 'N/A'}</p>

      <div className="profile-modal-additional-info">
        {me.studentId && (
          <p className='studentID'> 
            <svg
              className="studentID-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 640"
              aria-hidden="true"
            >
                <path d="M192 64C156.7 64 128 92.7 128 128L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 128C512 92.7 483.3 64 448 64L192 64zM288 416L352 416C396.2 416 432 451.8 432 496C432 504.8 424.8 512 416 512L224 512C215.2 512 208 504.8 208 496C208 451.8 243.8 416 288 416zM264 320C264 289.1 289.1 264 320 264C350.9 264 376 289.1 376 320C376 350.9 350.9 376 320 376C289.1 376 264 350.9 264 320zM280 128L360 128C373.3 128 384 138.7 384 152C384 165.3 373.3 176 360 176L280 176C266.7 176 256 165.3 256 152C256 138.7 266.7 128 280 128z"/>
            </svg>
          {me.studentId}</p>
        )}

        {me.department && (
          <p className='department'>
            <svg
              className="department-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 640"
              aria-hidden="true"
            >
              <path d="M32 256C32 220.7 60.7 192 96 192L160 192L287.9 76.9C306.2 60.5 333.9 60.5 352.1 76.9L480 192L544 192C579.3 192 608 220.7 608 256L608 512C608 547.3 579.3 576 544 576L96 576C60.7 576 32 547.3 32 512L32 256zM256 440L256 528L384 528L384 440C384 417.9 366.1 400 344 400L296 400C273.9 400 256 417.9 256 440zM144 448C152.8 448 160 440.8 160 432L160 400C160 391.2 152.8 384 144 384L112 384C103.2 384 96 391.2 96 400L96 432C96 440.8 103.2 448 112 448L144 448zM160 304L160 272C160 263.2 152.8 256 144 256L112 256C103.2 256 96 263.2 96 272L96 304C96 312.8 103.2 320 112 320L144 320C152.8 320 160 312.8 160 304zM528 448C536.8 448 544 440.8 544 432L544 400C544 391.2 536.8 384 528 384L496 384C487.2 384 480 391.2 480 400L480 432C480 440.8 487.2 448 496 448L528 448zM544 304L544 272C544 263.2 536.8 256 528 256L496 256C487.2 256 480 263.2 480 272L480 304C480 312.8 487.2 320 496 320L528 320C536.8 320 544 312.8 544 304zM320 320C355.3 320 384 291.3 384 256C384 220.7 355.3 192 320 192C284.7 192 256 220.7 256 256C256 291.3 284.7 320 320 320z" />
            </svg>
            {' '}
            {me.department.name || me.department.code || me.department}
          </p>
        )}

        {me.program && (
          <p className='program'> 
            <svg
              className="program-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 640"
              aria-hidden="true"
            >
              <path d="M480 576L192 576C139 576 96 533 96 480L96 160C96 107 139 64 192 64L496 64C522.5 64 544 85.5 544 112L544 400C544 420.9 530.6 438.7 512 445.3L512 512C529.7 512 544 526.3 544 544C544 561.7 529.7 576 512 576L480 576zM192 448C174.3 448 160 462.3 160 480C160 497.7 174.3 512 192 512L448 512L448 448L192 448zM224 216C224 229.3 234.7 240 248 240L424 240C437.3 240 448 229.3 448 216C448 202.7 437.3 192 424 192L248 192C234.7 192 224 202.7 224 216zM248 288C234.7 288 224 298.7 224 312C224 325.3 234.7 336 248 336L424 336C437.3 336 448 325.3 448 312C448 298.7 437.3 288 424 288L248 288z" />
            </svg>
            {' '}
            {me.program.name || me.program.code || me.program}
          </p>
        )}
      </div>

      <button className="logout-btn" onClick={onLogout}>
        Logout
      </button>
    </div>
  );
}