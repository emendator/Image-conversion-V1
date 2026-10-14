interface Props {
    label: string;
    accept?: string;
    multiple?: boolean;
    hasImage: boolean;
    preview: string;
    onFiles: (files: File[]) => void;
    style?: React.CSSProperties;
    hint?: string;
    children?: React.ReactNode;
}

import '../ui-details.css';

export default function UploadZone({
    label,
    accept = 'image/*',
    multiple = false,
    hasImage,
    preview,
    onFiles,
    style,
    hint,
    children,
}: Props) {
    return (
        <div
            className="ui-upload"
            style={{
                border: `2px ${hasImage ? 'solid' : 'dashed'} ${hasImage ? '#27ae60' : '#e0e3eb'}`,
                borderRadius: 10,
                padding: hasImage ? 8 : 20,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
                ...(hasImage ? {} : { display: 'flex', alignItems: 'center', justifyContent: 'center' }),
                ...style,
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
                if (files.length) onFiles(files);
            }}
        >
            {children}
            {hasImage ? (
                <img
                    src={preview}
                    alt="preview"
                    style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, display: 'block', margin: '0 auto' }}
                />
            ) : (
                <div style={{ color: '#636e72', fontSize: 13 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
                    {label}
                    {hint && (
                        <small style={{ display: 'block', marginTop: 4 }}>{hint}</small>
                    )}
                </div>
            )}
            <input
                type="file"
                accept={accept}
                multiple={multiple}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) onFiles(files);
                    e.target.value = '';
                }}
            />
        </div>
    );
}
