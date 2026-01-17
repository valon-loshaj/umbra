import { useState } from 'react'

import { AppConfig } from '@shared/types'

import { useConfig } from '../../contexts/ConfigContext'

interface SettingsModalProps {
	onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
	const { config, saveConfig } = useConfig()

	const [vaultPath, setVaultPath] = useState(config?.vault_path ?? '')
	const [anthropicKey, setAnthropicKey] = useState(config?.anthropic_api_key ?? '')
	const [awsAccessKey, setAwsAccessKey] = useState(config?.aws_access_key_id ?? '')
	const [awsSecretKey, setAwsSecretKey] = useState(config?.aws_secret_access_key ?? '')
	const [s3Bucket, setS3Bucket] = useState(config?.s3_bucket_name ?? '')
	const [encryptionKeyHash, setEncryptionKeyHash] = useState(config?.encryption_key_hash ?? '')

	const handleSave = async () => {
		try {
			const newConfig: AppConfig = {
				vault_path: vaultPath,
				anthropic_api_key: anthropicKey,
				aws_access_key_id: awsAccessKey,
				aws_secret_access_key: awsSecretKey,
				s3_bucket_name: s3Bucket,
				encryption_key_hash: encryptionKeyHash,
			}
			await saveConfig(newConfig)
			alert('Settings saved successfully!')
			onClose()
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			alert(`Failed to save settings: ${message}`)
		}
	}

	return (
		<div className="modal-overlay">
			<div className="modal modal--md">
				<div className="modal__header">
					<h2 className="modal__title">Settings</h2>
					<button onClick={onClose} className="btn btn--close">
						✕
					</button>
				</div>
				<div className="modal__content">
					<div className="form">
						<div className="form-group">
							<label className="form-label">Vault Path</label>
							<input
								type="text"
								value={vaultPath}
								onChange={(e) => setVaultPath(e.target.value)}
								placeholder="/path/to/vault"
								className="input"
							/>
						</div>

						<div className="form-group">
							<label className="form-label">Anthropic API Key</label>
							<input
								type="password"
								value={anthropicKey}
								onChange={(e) => setAnthropicKey(e.target.value)}
								placeholder="sk-..."
								className="input"
							/>
						</div>

						<div className="form-group">
							<label className="form-label">AWS Access Key ID</label>
							<input
								type="text"
								value={awsAccessKey}
								onChange={(e) => setAwsAccessKey(e.target.value)}
								placeholder="AKIA..."
								className="input"
							/>
						</div>

						<div className="form-group">
							<label className="form-label">AWS Secret Access Key</label>
							<input
								type="password"
								value={awsSecretKey}
								onChange={(e) => setAwsSecretKey(e.target.value)}
								placeholder="..."
								className="input"
							/>
						</div>

						<div className="form-group">
							<label className="form-label">S3 Bucket Name</label>
							<input
								type="text"
								value={s3Bucket}
								onChange={(e) => setS3Bucket(e.target.value)}
								placeholder="my-bucket"
								className="input"
							/>
						</div>

						<div className="form-group">
							<label className="form-label">Encryption Key Hash</label>
							<input
								type="password"
								value={encryptionKeyHash}
								onChange={(e) => setEncryptionKeyHash(e.target.value)}
								placeholder="..."
								className="input"
							/>
						</div>

						<div className="form-actions">
							<button onClick={onClose} className="btn btn--secondary">
								Cancel
							</button>
							<button onClick={handleSave} className="btn btn--primary">
								Save
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
