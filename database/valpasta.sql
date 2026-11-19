-- =========================================================
-- ValPasta - Sistema de Gestão de Manutenção (SGM)
-- MySQL 8+
-- =========================================================
CREATE DATABASE IF NOT EXISTS valpasta CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE valpasta;
SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS os_pecas;
DROP TABLE IF EXISTS ordens_servico;
DROP TABLE IF EXISTS pecas;
DROP TABLE IF EXISTS maquinas;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS funcionarios;
DROP TABLE IF EXISTS tipos_falha;
DROP TABLE IF EXISTS setores;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE setores (
  id_setor VARCHAR(5) PRIMARY KEY,
  nome VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE tipos_falha (
  id_tipo_falha INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE funcionarios (
  id_funcionario VARCHAR(10) PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  cargo VARCHAR(100) NOT NULL,
  turno ENUM('Manhã','Tarde','Noite','Administrativo') NOT NULL,
  especialidade VARCHAR(100) NULL
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  senha_hash VARCHAR(100) NOT NULL,
  perfil ENUM('operador','tecnico','gerente') NOT NULL,
  id_funcionario VARCHAR(10) NULL,
  id_setor VARCHAR(5) NULL,          -- limita o operador ao seu setor
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_usuario_func FOREIGN KEY (id_funcionario) REFERENCES funcionarios(id_funcionario)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_usuario_setor FOREIGN KEY (id_setor) REFERENCES setores(id_setor)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE maquinas (
  id_maquina VARCHAR(10) PRIMARY KEY,
  modelo VARCHAR(120) NOT NULL,
  id_setor VARCHAR(5) NOT NULL,
  data_aquisicao DATE NULL,
  ultima_manutencao DATE NULL,
  horas_funcionamento DECIMAL(10,2) NOT NULL DEFAULT 0,   -- horímetro do ciclo (zera na preventiva)
  horas_totais DECIMAL(12,2) NOT NULL DEFAULT 0,          -- horímetro acumulado
  limite_horas DECIMAL(10,2) NOT NULL,
  status ENUM('Operando','Manutenção próxima','Parada','Em manutenção') NOT NULL DEFAULT 'Operando',
  CONSTRAINT fk_maquina_setor FOREIGN KEY (id_setor) REFERENCES setores(id_setor)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE pecas (
  id_peca INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  estoque_atual INT NOT NULL DEFAULT 0,
  estoque_minimo INT NOT NULL DEFAULT 0,
  custo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT chk_estoque CHECK (estoque_atual >= 0)
) ENGINE=InnoDB;

CREATE TABLE ordens_servico (
  id_os INT AUTO_INCREMENT PRIMARY KEY,
  id_maquina VARCHAR(10) NOT NULL,
  tipo ENUM('Preventiva','Corretiva') NOT NULL,
  status ENUM('Aberta','Atribuída','Em andamento','Concluída') NOT NULL DEFAULT 'Aberta',
  descricao TEXT NOT NULL,
  foto MEDIUMTEXT NULL,                       -- data URL (base64)
  id_tipo_falha INT NULL,
  id_solicitante INT NULL,                    -- NULL = gerada automaticamente pelo sistema
  id_tecnico VARCHAR(10) NULL,
  tempo_estimado DECIMAL(6,2) NULL,
  tempo_reparo DECIMAL(6,2) NULL,
  data_abertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_inicio DATETIME NULL,
  data_conclusao DATETIME NULL,
  automatica TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_os_maquina FOREIGN KEY (id_maquina) REFERENCES maquinas(id_maquina)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_os_tipo_falha FOREIGN KEY (id_tipo_falha) REFERENCES tipos_falha(id_tipo_falha)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_os_solicitante FOREIGN KEY (id_solicitante) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_os_tecnico FOREIGN KEY (id_tecnico) REFERENCES funcionarios(id_funcionario)
    ON UPDATE CASCADE ON DELETE SET NULL,
  INDEX idx_os_status (status),
  INDEX idx_os_maquina (id_maquina, tipo)
) ENGINE=InnoDB;

CREATE TABLE os_pecas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_os INT NOT NULL,
  id_peca INT NOT NULL,
  quantidade INT NOT NULL,
  custo_unitario DECIMAL(10,2) NOT NULL,      -- custo congelado no momento da baixa
  CONSTRAINT fk_ospeca_os FOREIGN KEY (id_os) REFERENCES ordens_servico(id_os) ON DELETE CASCADE,
  CONSTRAINT fk_ospeca_peca FOREIGN KEY (id_peca) REFERENCES pecas(id_peca) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------- DADOS INICIAIS ----------
INSERT INTO setores VALUES ('S01','Bobinagem'),('S02','Corte'),('S03','Ondulado'),('S04','Colagem'),('S05','Manutenção');

INSERT INTO tipos_falha (nome) VALUES ('Mecânica'),('Elétrica'),('Hidráulica'),('Pneumática'),('Eletrônica'),('Outro');

INSERT INTO funcionarios VALUES
 ('F-01','Carlos Silva','Técnico','Manhã','Mecânica'),
 ('F-02','Ana Souza','Técnica','Tarde','Elétrica'),
 ('F-03','Roberto Lima','Supervisor de Manutenção','Administrativo','Gestão');

INSERT INTO maquinas (id_maquina,modelo,id_setor,data_aquisicao,ultima_manutencao,horas_funcionamento,horas_totais,limite_horas,status) VALUES
 ('MQ-01','Bobinadeira BX-200','S01','2020-03-10','2026-09-01',320,3320,500,'Operando'),
 ('MQ-02','Cortadora CT-90','S02','2019-07-22','2026-08-15',370,5870,400,'Manutenção próxima'),
 ('MQ-03','Onduladeira OD-5','S03','2021-01-05','2026-10-02',610,4110,600,'Parada'),
 ('MQ-04','Coladeira CL-12','S04','2022-05-18','2026-10-20',100,2100,450,'Em manutenção');

INSERT INTO pecas (nome,estoque_atual,estoque_minimo,custo_unitario) VALUES
 ('Lâmina de corte',5,2,120.00),
 ('Rolamento 6205',10,4,35.00),
 ('Correia V-A42',3,5,28.00),
 ('Óleo lubrificante 1L',8,3,45.00);

-- OS de exemplo (coerentes com o status das máquinas)
INSERT INTO ordens_servico (id_maquina,tipo,status,descricao,id_tipo_falha,id_tecnico,tempo_estimado,tempo_reparo,data_abertura,data_inicio,data_conclusao) VALUES
 ('MQ-02','Corretiva','Concluída','Lâmina quebrada',1,'F-02',3,3,'2026-08-15 08:00:00','2026-08-15 08:30:00','2026-08-15 11:30:00'),
 ('MQ-03','Corretiva','Atribuída','Ruído no eixo',1,'F-01',4,NULL,'2026-10-02 09:00:00',NULL,NULL),
 ('MQ-04','Preventiva','Em andamento','Revisão geral',NULL,'F-02',2,NULL,'2026-10-20 07:00:00','2026-10-20 07:30:00',NULL);
INSERT INTO os_pecas (id_os,id_peca,quantidade,custo_unitario) VALUES (1,1,1,120.00);
