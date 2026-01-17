import Editor, { OnMount } from '@monaco-editor/react'
import { editor, KeyMod, KeyCode } from 'monaco-editor'
import { useRef, useEffect } from 'react'

interface MarkdownEditorProps {
	value: string
	onChange: (value: string) => void
	onSave?: () => void
	isDirty?: boolean
}

export function MarkdownEditor({ value, onChange, onSave, isDirty }: MarkdownEditorProps) {
	const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
	const onSaveRef = useRef(onSave)

	useEffect(() => {
		onSaveRef.current = onSave
	}, [onSave])

	const handleEditorDidMount: OnMount = (editorInstance) => {
		editorRef.current = editorInstance

		editorInstance.addCommand(
			KeyMod.CtrlCmd | KeyCode.KeyS,
			() => {
				if (onSaveRef.current) {
					onSaveRef.current()
				}
			},
		)

		editorInstance.focus()
	}

	useEffect(() => {
		if (editorRef.current) {
			const currentValue = editorRef.current.getValue()
			if (currentValue !== value) {
				editorRef.current.setValue(value)
			}
		}
	}, [value])

	return (
		<div className="editor">
			{isDirty && (
				<div className="editor__dirty-indicator">
					Unsaved changes
				</div>
			)}
			<Editor
				height="100%"
				defaultLanguage="markdown"
				value={value}
				onChange={(newValue) => onChange(newValue || '')}
				onMount={handleEditorDidMount}
				theme="vs-dark"
				options={{
					minimap: { enabled: false },
					fontSize: 14,
					lineNumbers: 'on',
					wordWrap: 'on',
					wrappingIndent: 'indent',
					padding: { top: 16, bottom: 16 },
					scrollBeyondLastLine: false,
					automaticLayout: true,
				}}
			/>
		</div>
	)
}
