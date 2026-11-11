-- =========================================================
-- PAPELSUL EMBALAGENS LTDA.
-- Sistema de Controle de Manutenção
-- Banco de dados MySQL (Corrigido)
-- =========================================================

CREATE DATABASE IF NOT EXISTS papelsul_manutencao
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE papelsul_manutencao;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS paradas;
DROP TABLE IF EXISTS manutencoes;
DROP TABLE IF EXISTS maquinas;
DROP TABLE IF EXISTS funcionarios;
DROP TABLE IF EXISTS setores;
DROP TABLE IF EXISTS tipos_falha;
DROP TABLE IF EXISTS situacoes_maquina;

CREATE TABLE setores (
    id_setor VARCHAR(3) PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    quantidade_funcionarios INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE funcionarios (
    id_funcionario VARCHAR(10) PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    id_setor VARCHAR(3) NOT NULL,
    turno VARCHAR(30) NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(150),
    CONSTRAINT fk_funcionario_setor
        FOREIGN KEY (id_setor) REFERENCES setores(id_setor)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE situacoes_maquina (
    id_situacao INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE maquinas (
    id_maquina VARCHAR(10) PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    modelo VARCHAR(80),
    id_setor VARCHAR(3) NOT NULL,
    fabricante VARCHAR(100),
    data_aquisicao DATE,
    ultima_manutencao DATE,
    horas_funcionamento DECIMAL(10,2) NOT NULL DEFAULT 0,
    limite_horas DECIMAL(10,2) NOT NULL,
    id_situacao INT NOT NULL,
    CONSTRAINT fk_maquina_setor
        FOREIGN KEY (id_setor) REFERENCES setores(id_setor)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_maquina_situacao
        FOREIGN KEY (id_situacao) REFERENCES situacoes_maquina(id_situacao)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE tipos_falha (
    id_tipo_falha INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE manutencoes (
    id_manutencao VARCHAR(10) PRIMARY KEY,
    id_maquina VARCHAR(10) NOT NULL,
    id_tecnico VARCHAR(10) NOT NULL,
    data_manutencao DATE NOT NULL,
    tipo ENUM('Preventiva','Corretiva') NOT NULL,
    descricao TEXT NOT NULL,
    pecas_utilizadas VARCHAR(255),
    tempo DECIMAL(6,2) NOT NULL DEFAULT 0,
    id_tipo_falha INT NULL,
    CONSTRAINT fk_manutencao_maquina
        FOREIGN KEY (id_maquina) REFERENCES maquinas(id_maquina)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_manutencao_tecnico
        FOREIGN KEY (id_tecnico) REFERENCES funcionarios(id_funcionario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_manutencao_tipo_falha
        FOREIGN KEY (id_tipo_falha) REFERENCES tipos_falha(id_tipo_falha)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE paradas (
    id_parada VARCHAR(10) PRIMARY KEY,
    id_maquina VARCHAR(10) NOT NULL,
    data_parada DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fim TIME NULL,
    motivo VARCHAR(100) NOT NULL,
    descricao TEXT,
    tempo_parado DECIMAL(8,2) NULL,
    id_tipo_falha INT NULL,
    CONSTRAINT fk_parada_maquina
        FOREIGN KEY (id_maquina) REFERENCES maquinas(id_maquina)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_parada_tipo_falha
        FOREIGN KEY (id_tipo_falha) REFERENCES tipos_falha(id_tipo_falha)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- SETORES
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S01', 'Produção de Papel', 55);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S02', 'Corte e Rebobinamento', 35);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S03', 'Impressão', 30);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S04', 'Fabricação de Embalagens', 60);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S05', 'Qualidade', 15);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S06', 'Almoxarifado', 20);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S07', 'Expedição', 25);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S08', 'Manutenção', 25);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S09', 'Administração', 20);
INSERT INTO setores (id_setor, nome, quantidade_funcionarios) VALUES ('S10', 'TI', 5);

-- SITUAÇÕES DAS MÁQUINAS
INSERT INTO situacoes_maquina (nome) VALUES ('Operando');
INSERT INTO situacoes_maquina (nome) VALUES ('Manutenção próxima');
INSERT INTO situacoes_maquina (nome) VALUES ('Em manutenção');
INSERT INTO situacoes_maquina (nome) VALUES ('Parada');

-- TIPOS DE FALHA
INSERT INTO tipos_falha (nome) VALUES ('Mecânica');
INSERT INTO tipos_falha (nome) VALUES ('Elétrica');
INSERT INTO tipos_falha (nome) VALUES ('Hidráulica');
INSERT INTO tipos_falha (nome) VALUES ('Pneumática');
INSERT INTO tipos_falha (nome) VALUES ('Eletrônica');
INSERT INTO tipos_falha (nome) VALUES ('Outro');

-- FUNCIONÁRIOS
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F001', 'Lucas Oliveira', 'Técnico Mecânico', 'S08', '1º', '(49) 97001-1001', 'lucas.oliveira1@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F002', 'Rafael Almeida', 'Técnico Eletricista', 'S08', '2º', '(49) 97002-1002', 'rafael.almeida2@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F003', 'Diego Costa', 'Mecânico', 'S08', '3º', '(49) 97003-1003', 'diego.costa3@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F004', 'João Rodrigues', 'Supervisor de Manutenção', 'S08', 'Administrativo', '(49) 97004-1004', 'joão.rodrigues4@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F005', 'Pedro Nunes', 'Técnico Mecânico', 'S08', '1º', '(49) 97005-1005', 'pedro.nunes5@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F006', 'Bruno Souza', 'Técnico Eletricista', 'S08', '2º', '(49) 97006-1006', 'bruno.souza6@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F007', 'Gustavo Oliveira', 'Mecânico', 'S08', '3º', '(49) 97007-1007', 'gustavo.oliveira7@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F008', 'Ricardo Almeida', 'Supervisor de Manutenção', 'S08', 'Administrativo', '(49) 97008-1008', 'ricardo.almeida8@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F009', 'Juliana Costa', 'Técnico Mecânico', 'S08', '1º', '(49) 97009-1009', 'juliana.costa9@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F010', 'Mariana Rodrigues', 'Técnico Eletricista', 'S08', '2º', '(49) 97010-1010', 'mariana.rodrigues10@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F011', 'Carlos Nunes', 'Mecânico', 'S08', '3º', '(49) 97011-1011', 'carlos.nunes11@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F012', 'Felipe Souza', 'Supervisor de Manutenção', 'S08', 'Administrativo', '(49) 97012-1012', 'felipe.souza12@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F013', 'Gabriel Oliveira', 'Técnico Mecânico', 'S08', '1º', '(49) 97013-1013', 'gabriel.oliveira13@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F014', 'Ana Almeida', 'Técnico Eletricista', 'S08', '2º', '(49) 97014-1014', 'ana.almeida14@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F015', 'Camila Costa', 'Mecânico', 'S08', '3º', '(49) 97015-1015', 'camila.costa15@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F016', 'Fernanda Rodrigues', 'Supervisor de Manutenção', 'S08', 'Administrativo', '(49) 97016-1016', 'fernanda.rodrigues16@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F017', 'Mateus Nunes', 'Técnico Mecânico', 'S08', '1º', '(49) 97017-1017', 'mateus.nunes17@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F018', 'Thiago Souza', 'Técnico Eletricista', 'S08', '2º', '(49) 97018-1018', 'thiago.souza18@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F019', 'Beatriz Oliveira', 'Mecânico', 'S08', '3º', '(49) 97019-1019', 'beatriz.oliveira19@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F020', 'Vinícius Almeida', 'Supervisor de Manutenção', 'S08', 'Administrativo', '(49) 97020-1020', 'vinícius.almeida20@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F021', 'Larissa Costa', 'Técnico Mecânico', 'S08', '1º', '(49) 97021-1021', 'larissa.costa21@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F022', 'Eduardo Rodrigues', 'Técnico Eletricista', 'S08', '2º', '(49) 97022-1022', 'eduardo.rodrigues22@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F023', 'Amanda Nunes', 'Mecânico', 'S08', '3º', '(49) 97023-1023', 'amanda.nunes23@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F024', 'Guilherme Souza', 'Supervisor de Manutenção', 'S08', 'Administrativo', '(49) 97024-1024', 'guilherme.souza24@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F025', 'André Oliveira', 'Técnico Mecânico', 'S08', '1º', '(49) 97025-1025', 'andré.oliveira25@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F026', 'Lucas Almeida', 'Técnico Eletricista', 'S08', '2º', '(49) 97026-1026', 'lucas.almeida26@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F027', 'Rafael Costa', 'Mecânico', 'S08', '3º', '(49) 97027-1027', 'rafael.costa27@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F028', 'Diego Rodrigues', 'Supervisor de Manutenção', 'S08', 'Administrativo', '(49) 97028-1028', 'diego.rodrigues28@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F029', 'João Nunes', 'Técnico Mecânico', 'S08', '1º', '(49) 97029-1029', 'joão.nunes29@papelsul.com.br');
INSERT INTO funcionarios (id_funcionario, nome, cargo, id_setor, turno, telefone, email) VALUES ('F030', 'Pedro Souza', 'Técnico Eletricista', 'S08', '2º', '(49) 97030-1030', 'pedro.souza30@papelsul.com.br');

-- MÁQUINAS (EXEMPLOS ILUSTRATIVOS)
INSERT INTO maquinas (id_maquina,nome,modelo,id_setor,fabricante,data_aquisicao,ultima_manutencao,horas_funcionamento,limite_horas,id_situacao) VALUES ('M001', 'Bobinadeira 01', 'BW-500', 'S02', 'Bobinex', '2021-03-03', '2026-09-03', 4007.00, 4000.00, 2);
INSERT INTO maquinas (id_maquina,nome,modelo,id_setor,fabricante,data_aquisicao,ultima_manutencao,horas_funcionamento,limite_horas,id_situacao) VALUES ('M015', 'Envasadora 01', 'EV-250', 'S04', 'PackTech', '2022-12-21', '2026-10-01', 6424.00, 6400.00, 2);
INSERT INTO maquinas (id_maquina,nome,modelo,id_setor,fabricante,data_aquisicao,ultima_manutencao,horas_funcionamento,limite_horas,id_situacao) VALUES ('M022', 'Calandra 02', 'CL-700', 'S01', 'PaperTech', '2023-11-15', '2026-09-10', 5320.00, 5500.00, 1);
INSERT INTO maquinas (id_maquina,nome,modelo,id_setor,fabricante,data_aquisicao,ultima_manutencao,horas_funcionamento,limite_horas,id_situacao) VALUES ('M026', 'Laminadora 02', 'LM-600', 'S04', 'FlexPack', '2024-05-21', '2026-09-18', 7020.00, 7500.00, 3);
INSERT INTO maquinas (id_maquina,nome,modelo,id_setor,fabricante,data_aquisicao,ultima_manutencao,horas_funcionamento,limite_horas,id_situacao) VALUES ('M030', 'Guilhotina 02', 'GT-400', 'S02', 'CorteMax', '2024-11-25', '2026-09-26', 4553.00, 5000.00, 1);

-- MANUTENÇÕES (CORRIGIDO: Valores de tempo em formato DECIMAL de horas)
INSERT INTO manutencoes (id_manutencao,id_maquina,id_tecnico,data_manutencao,tipo,descricao,pecas_utilizadas,tempo) VALUES ('MAN001', 'M022', 'F003', '2026-08-03', 'Preventiva', 'Inspeção de componentes', 'Óleo lubrificante', 6.00);
INSERT INTO manutencoes (id_manutencao,id_maquina,id_tecnico,data_manutencao,tipo,descricao,pecas_utilizadas,tempo) VALUES ('MAN002', 'M030', 'F007', '2026-08-05', 'Corretiva', 'Correção de vazamento', 'Filtro de ar', 3.00);
INSERT INTO manutencoes (id_manutencao,id_maquina,id_tecnico,data_manutencao,tipo,descricao,pecas_utilizadas,tempo) VALUES ('MAN003', 'M015', 'F012', '2026-08-07', 'Preventiva', 'Ajuste de correias', 'Contatores', 1.50);
INSERT INTO manutencoes (id_manutencao,id_maquina,id_tecnico,data_manutencao,tipo,descricao,pecas_utilizadas,tempo) VALUES ('MAN070', 'M026', 'F003', '2026-08-05', 'Preventiva', 'Inspeção de componentes', 'Óleo lubrificante', 5.00);

SET FOREIGN_KEY_CHECKS = 1;