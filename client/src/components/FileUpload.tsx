import React from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, selectedFile }) => {
  const handleFileSelect = async () => {
    try {
      const file = await window.electronAPI.selectFile();
      if (file) {
        onFileSelect(file);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
    }
  };

  return (
    <div className="panel-section">
      <h3>STL File</h3>
      <div
        className={`file-upload-area ${selectedFile ? 'has-file' : ''}`}
        onClick={handleFileSelect}
      >
        {selectedFile ? (
          <div>
            <div>✓ File Selected</div>
            <div style={{ fontSize: '0.9rem', marginTop: '8px', color: '#ccc' }}>
              {selectedFile.name}
            </div>
          </div>
        ) : (
          <div>
            <div>Click to select STL file</div>
            <div style={{ fontSize: '0.8rem', marginTop: '8px', color: '#999' }}>
              Supported formats: .stl
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;